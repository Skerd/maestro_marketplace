import {ObjectId} from "mongodb";
import {action} from "@coreModule/api/actionDecorator";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import type {ActionMessage, SingleForm} from "armonia/src/modules/core/types/shared.types";
import {quoteTaskLeadFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/taskLead/quoteTaskLead.form.validator";
import type {QuoteTaskLeadFormType} from "armonia/src/modules/marketplace/api/marketplace/private/taskLead/taskLead.schema-def";
import {runAfterCommit, type TransactionRequiredParams} from "@coreModule/utilities/middlewares/transactionUtils";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {allowForeignReferences, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {taskLeadService} from "@marketplaceModule/database/schemas/taskLead/taskLead.service";
import {bidService} from "@marketplaceModule/database/schemas/bid/bid.service";
import {jobBidData} from "@marketplaceModule/utilities/services/jobBids";
import {loadOwnLead, openLeadJob} from "@marketplaceModule/utilities/services/taskLeads";
import {assertNoCompanyQuote, assertTaskBoardBidder, boardLeadFor, loadPublicTask} from "@marketplaceModule/utilities/services/taskBoard";
import {emailNewQuote} from "@marketplaceModule/utilities/services/quoteEmails";
import {publishTaskChange, pushQuoteToBuyer} from "@marketplaceModule/utilities/services/taskBoardEvents";
import type {ITaskLead} from "@marketplaceModule/database/schemas/taskLead/taskLead";
import type {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";

const LEAD_BID_REFERENCE = {reason: "a lead records the quote its provider placed next to the job in the marketplace operator", fields: ["TaskLead.bid"]} as const;

/**
 * A provider's answers to a lead (D143) and their quote from the task board (D172). Each is the lead provider's own (or an
 * admin's on their behalf), and a company keeps one live quote per task.
 */
export class TaskLeadActions {
    /** Places the provider's quote as a bid next to the job, in the job's currency, and marks the lead quoted. */
    @action({auth: "private", rateLimit: {windowMs: 60000, max: 20}, transaction: true, schema: quoteTaskLeadFormSchema})
    async quote(params: Record<string, any>): Promise<ActionMessage & {_id: string}> {
        const p = params as TransactionRequiredParams & QuoteTaskLeadFormType;
        const {logger, languageCode, session, company, actionUserCtx, _id} = p;
        const ctx = {logger, languageCode, session};
        logger.start(`Quoting on lead ${_id}...`);

        const lead = await loadOwnLead(_id, company._id, actionUserCtx, ctx);
        const job = await openLeadJob(lead, ctx);
        await assertNoCompanyQuote(job._id, company._id, ctx);
        return placeLeadQuote(lead, job, p);
    }

    /**
     * A quote from the task board (D172): any services company quotes on a public task, matched or not (`_id` is the
     * task). It goes through the caller's lead, the matched one or a new board lead, so the award, loss notices and
     * close/reopen treat every quote alike; one live quote per company. From the portal the caller names the company in
     * `actAs`, checked against their role there (`memberCompany`, D172).
     */
    @action({auth: "private", rateLimit: {windowMs: 60000, max: 20}, transaction: true, schema: quoteTaskLeadFormSchema, memberCompany: true})
    async quoteJob(params: Record<string, any>): Promise<ActionMessage & {_id: string}> {
        const p = params as TransactionRequiredParams & QuoteTaskLeadFormType;
        const {logger, languageCode, session, company, actionUserCtx, _id} = p;
        const ctx = {logger, languageCode, session};
        logger.start(`Quoting on task ${_id} from the task board...`);

        await assertTaskBoardBidder(company._id, languageCode);
        const task = await loadPublicTask(_id, ctx);
        await assertNoCompanyQuote(task._id, company._id, ctx);
        const lead = await boardLeadFor(task, company._id, actionUserCtx, ctx);
        const job = await openLeadJob(lead, ctx);
        return placeLeadQuote(lead, job, p);
    }

    /** The provider passes on the job; the lead stays for the record. */
    @action({auth: "private", rateLimit: {windowMs: 60000, max: 30}, transaction: true, schema: validateSingleForm})
    async decline(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & SingleForm;
        const {logger, languageCode, session, company, actionUserCtx, _id} = p;
        const ctx = {logger, languageCode, session};

        const lead = await loadOwnLead(_id, company._id, actionUserCtx, ctx);
        if (lead.status !== "new" && lead.status !== "viewed") {
            throw apiValidationException("task_lead_not_open", "", null, languageCode);
        }
        await taskLeadService.updateByIdOrThrow(new ObjectId(_id), {$set: {status: "declined"}}, {session, logger, languageCode, auditUserId: actionUserCtx.userId});
        return {message: "Lead declined"};
    }
}

/**
 * The one way a quote is placed (BE-02): a bid next to the job in the job's company, in its currency, with the
 * provider's own company kept on it for the award (P12.5); the lead turns `quoted`, and the buyer hears of it by email
 * after the commit, as the portal has no notification list (P12.4).
 */
async function placeLeadQuote(lead: ITaskLead, job: ITaskRequest, p: TransactionRequiredParams & QuoteTaskLeadFormType): Promise<ActionMessage & {_id: string}> {
    const {logger, languageCode, session, company, actionUserCtx, amount, proposal, deliveryDays} = p;
    const ctx = {logger, languageCode, session};
    const provider = nestedEntityToRef(lead.provider);
    const jobCompany = nestedEntityToRef(job.company);
    if (!provider || !jobCompany) throw apiValidationException("task_lead_not_open", "", null, languageCode);

    const bid = await withTenant(jobCompany, async () => bidService.create(
        {...await jobBidData(job, {bidder: provider, bidderCompany: company._id, amount, proposal, deliveryDays}, ctx), company: jobCompany},
        {session, logger, languageCode, auditUserId: actionUserCtx.userId},
    ), "marketplace");

    await allowForeignReferences(LEAD_BID_REFERENCE, () => taskLeadService.updateByIdOrThrow(
        lead._id,
        {$set: {status: "quoted", bid: bid._id}},
        {session, logger, languageCode, auditUserId: actionUserCtx.userId},
    ));

    await runAfterCommit(session, async () => {
        await emailNewQuote(job, {provider, providerCompany: company._id, amount, deliveryDays});
        // Live (D172): the board and the task page see the new count; the buyer's page reads its quotes again.
        pushQuoteToBuyer(job);
        await publishTaskChange(job._id, logger);
    });

    logger.finish(`Quoted ${amount} on lead ${lead._id.toString()}`);
    return {message: "Quote sent", _id: bid._id.toString()};
}
