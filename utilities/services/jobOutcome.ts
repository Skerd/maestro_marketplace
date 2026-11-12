import {ObjectId} from "mongodb";
import type {ClientSession} from "mongoose";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {allowForeignReferences, asCrossTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {runAfterCommit} from "@coreModule/utilities/middlewares/transactionUtils";
import {sameCurrencyIn} from "@coreModule/utilities/helpers/referenceData";
import {emitNotificationEvent} from "@coreModule/domain/notifications/notificationEventBus";
import type {serverLogger} from "@coreModule/loggers/serverLog";
import type {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import type {IBid} from "@marketplaceModule/database/schemas/bid/bid";
import type {IOrder} from "@marketplaceModule/database/schemas/order/order";
import {orderService} from "@marketplaceModule/database/schemas/order/order.service";
import {bidService} from "@marketplaceModule/database/schemas/bid/bid.service";
import {taskLeadService} from "@marketplaceModule/database/schemas/taskLead/taskLead.service";

type Ctx = {session?: ClientSession | null; logger: serverLogger; languageCode: string; auditUserId?: string};

/** A lead that just ended, enough to tell its provider in their own company (D143). */
export type EndedLead = {_id: ObjectId; company: ObjectId; provider: ObjectId; quoted: boolean; won: boolean};

const LEADS_REASON = "a job's outcome reaches the leads it gave in the providers' companies";
const AWARD_REFERENCE = {
    reason: "an awarded portal job's order, in the winning provider's company, points at the job and quote in the marketplace operator",
    fields: ["Order.taskRequest", "Order.bid"],
} as const;
const OPEN_LEAD = ["new", "viewed", "quoted"];

/**
 * Ends a job's open leads in every provider company (D143): on an award the winning quote's lead is `won` and the rest
 * `lost`; on expiry all are `expired`. Declined leads stay declined. Returns the ended leads for the notices.
 */
export async function endJobLeads(jobId: ObjectId, outcome: {winningBid: ObjectId} | "expired", ctx: Ctx): Promise<EndedLead[]> {
    const opts = {session: ctx.session ?? undefined, logger: ctx.logger, languageCode: ctx.languageCode};
    return asCrossTenant(LEADS_REASON, async () => {
        const leads = await taskLeadService.find({taskRequest: jobId, status: {$in: OPEN_LEAD}}, opts, null, "company provider status bid");
        const ended: EndedLead[] = [];
        for (const lead of leads) {
            const company = nestedEntityToRef(lead.company);
            const provider = nestedEntityToRef(lead.provider);
            if (!company || !provider) continue;
            const won = outcome !== "expired" && !!nestedEntityToRef(lead.bid)?.equals(outcome.winningBid);
            const status = outcome === "expired" ? "expired" : won ? "won" : "lost";
            await withTenant(company, () => taskLeadService.updateByIdOrThrow(lead._id, {$set: {status}}, {...opts, auditUserId: ctx.auditUserId}), "marketplace");
            ended.push({_id: lead._id, company, provider, quoted: lead.status === "quoted", won});
        }
        return ended;
    });
}

/** A reopened job takes quotes again: its expired leads come back, as quoted while their quote is still pending. */
export async function reviveJobLeads(jobId: ObjectId, ctx: Ctx): Promise<void> {
    const opts = {session: ctx.session ?? undefined, logger: ctx.logger, languageCode: ctx.languageCode};
    await asCrossTenant(LEADS_REASON, async () => {
        const leads = await taskLeadService.find({taskRequest: jobId, status: "expired"}, opts, null, "company bid");
        const bidIds = leads.map((lead) => nestedEntityToRef(lead.bid)).filter((id): id is ObjectId => !!id);
        const pending = new Set((bidIds.length ? await bidService.find({_id: {$in: bidIds}, status: "pending"}, opts, null, "_id") : []).map((bid) => bid._id.toString()));
        for (const lead of leads) {
            const company = nestedEntityToRef(lead.company);
            if (!company) continue;
            const status = pending.has(nestedEntityToRef(lead.bid)?.toString() ?? "") ? "quoted" : "new";
            await withTenant(company, () => taskLeadService.updateByIdOrThrow(lead._id, {$set: {status}}, {...opts, auditUserId: ctx.auditUserId}), "marketplace");
        }
    });
}

/** Tells each provider, in their own company, how their lead ended; the notice opens the lead (D145). */
export async function notifyEndedLeads(code: string, leads: EndedLead[], job: Pick<ITaskRequest, "_id" | "title">, ctx: Ctx): Promise<void> {
    if (!leads.length) return;
    await runAfterCommit(ctx.session ?? undefined, async () => {
        for (const lead of leads) {
            emitNotificationEvent(code, {
                receiverIds: [lead.provider.toString()],
                payload: {
                    companyId: lead.company.toString(),
                    languageCode: ctx.languageCode,
                    leadId: lead._id.toString(),
                    taskRequestId: job._id.toString(),
                    taskRequestTitle: job.title,
                },
            });
        }
    });
}

/**
 * Opens the order for an accepted quote from a lead in the winning provider's company (D143), as a purchase from that
 * seller: the buyer is the customer, the price is the quote's, in the provider's own copy of the currency (by ISO code).
 * The order keeps its job and quote, which stay in the operator.
 */
export async function openAwardOrder(job: ITaskRequest, bid: IBid, ctx: Ctx): Promise<IOrder> {
    const providerCompany = nestedEntityToRef(bid.bidderCompany);
    const currencyRef = nestedEntityToRef(bid.currency);
    if (!providerCompany || !currencyRef) throw apiValidationException("bid_not_found_or_already_processed", null, null, ctx.languageCode);
    const opts = {session: ctx.session ?? undefined, logger: ctx.logger, languageCode: ctx.languageCode};
    const currency = await sameCurrencyIn(providerCompany, currencyRef, opts);
    if (!currency) throw apiValidationException("marketplace_currency_not_configured", "", null, ctx.languageCode);
    return withTenant(providerCompany, () => allowForeignReferences(AWARD_REFERENCE, () => orderService.create(
        {
            taskRequest: job._id,
            bid: bid._id,
            customer: nestedEntityToRef(job.requester),
            provider: nestedEntityToRef(bid.bidder),
            amount: bid.amount,
            currency,
            status: "pending",
            company: providerCompany,
            ...(bid.deliveryDays > 0 && {deliveryDueDate: new Date(Date.now() + bid.deliveryDays * 24 * 60 * 60 * 1000)}),
        },
        {...opts, auditUserId: ctx.auditUserId},
    )), "marketplace");
}
