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
import {emailNewQuote} from "@marketplaceModule/utilities/services/quoteEmails";

const LEAD_BID_REFERENCE = {reason: "a lead records the quote its provider placed next to the job in the marketplace operator", fields: ["TaskLead.bid"]} as const;

/** A provider's answers to a lead (D143). Both are the lead provider's own (or an admin's on their behalf). */
export class TaskLeadActions {
    /** Places the provider's quote as a bid next to the job, in the job's currency, and marks the lead quoted. */
    @action({auth: "private", rateLimit: {windowMs: 60000, max: 20}, transaction: true, schema: quoteTaskLeadFormSchema})
    async quote(params: Record<string, any>): Promise<ActionMessage & {_id: string}> {
        const p = params as TransactionRequiredParams & QuoteTaskLeadFormType;
        const {logger, languageCode, session, company, actionUserCtx, _id, amount, proposal, deliveryDays} = p;
        const ctx = {logger, languageCode, session};
        logger.start(`Quoting on lead ${_id}...`);

        const lead = await loadOwnLead(_id, company._id, actionUserCtx, ctx);
        const job = await openLeadJob(lead, ctx);
        const provider = nestedEntityToRef(lead.provider);
        const jobCompany = nestedEntityToRef(job.company);
        if (!provider || !jobCompany) throw apiValidationException("task_lead_not_open", "", null, languageCode);

        // The bid is the job's company's record; the provider's own company is kept on it for the award (P12.5).
        const bid = await withTenant(jobCompany, async () => bidService.create(
            {...await jobBidData(job, {bidder: provider, bidderCompany: company._id, amount, proposal, deliveryDays}, ctx), company: jobCompany},
            {session, logger, languageCode, auditUserId: actionUserCtx.userId},
        ), "marketplace");

        await allowForeignReferences(LEAD_BID_REFERENCE, () => taskLeadService.updateByIdOrThrow(
            lead._id,
            {$set: {status: "quoted", bid: bid._id}},
            {session, logger, languageCode, auditUserId: actionUserCtx.userId},
        ));

        // The portal has no notification list: the buyer hears of the quote by email (P12.4).
        await runAfterCommit(session, () => emailNewQuote(job, {provider, providerCompany: company._id, amount, deliveryDays}));

        logger.finish(`Quoted ${amount} on lead ${_id}`);
        return {message: "Quote sent", _id: bid._id.toString()};
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
