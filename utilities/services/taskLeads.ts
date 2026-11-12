import {ObjectId} from "mongodb";
import type {ClientSession} from "mongoose";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import type {TaskLead} from "armonia/src/modules/marketplace/api/marketplace/private/taskLead/taskLead.dto";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import type {serverLogger} from "@coreModule/loggers/serverLog";
import type {UserContext} from "@coreModule/utilities/types/types";
import type {ITaskLead} from "@marketplaceModule/database/schemas/taskLead/taskLead";
import type {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import type {IBid} from "@marketplaceModule/database/schemas/bid/bid";
import {taskLeadService} from "@marketplaceModule/database/schemas/taskLead/taskLead.service";
import {taskRequestService} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.service";
import {bidService} from "@marketplaceModule/database/schemas/bid/bid.service";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {taskLeadToDTO} from "@marketplaceModule/utilities/mappers/taskLead/taskLeadMapper.dto";
import {assertOwnerOrAdmin} from "@marketplaceModule/utilities/services/marketplaceAccess";

type Ctx = {logger: serverLogger; languageCode: string; session?: ClientSession | null};

const JOB_REASON = "a lead shows the job it points at, which the marketplace operator keeps";
/** What a provider may see of a job before the award (D143): no street, postcode, pin or buyer. */
const JOB_POPULATE = ["category", "currency", "address.country", "address.state", "address.city", "mainImage", "imageGallery"];
const JOB_SELECT = "name title description category budgetMax currency address.country address.state address.city status expiresAt createdAt mainImage imageGallery company";

/** Non-admins see only the leads of which they are the provider. */
export function leadVisibilityFilter(companyId: ObjectId, caller: UserContext): Record<string, unknown> {
    return caller.isAdmin ? {company: companyId} : {company: companyId, provider: new ObjectId(caller.userId)};
}

/** The leads with the job each points at (redacted) and the quote placed from it. */
export async function taskLeadsToViews(leads: ITaskLead[], ctx: Ctx): Promise<TaskLead[]> {
    if (!leads.length) return [];
    const opts = {logger: ctx.logger, languageCode: ctx.languageCode, session: ctx.session ?? undefined};
    // The leads' own reference ids, read unpopulated: a route's populate runs in the provider's tenant, where the
    // operator's job and bid read as empty, so the documents handed in may have lost them.
    const refs = await taskLeadService.find({_id: {$in: leads.map((lead) => lead._id)}}, opts, null, "taskRequest bid listing");
    const refsById = new Map(refs.map((row) => [row._id.toString(), {
        job: nestedEntityToRef(row.taskRequest),
        bid: nestedEntityToRef(row.bid),
        listing: nestedEntityToRef(row.listing),
    }]));
    const refsOf = (lead: ITaskLead) => refsById.get(lead._id.toString()) ?? {job: undefined, bid: undefined, listing: undefined};
    const jobIds = leads.map((lead) => refsOf(lead).job).filter((id): id is ObjectId => !!id);
    const bidIds = leads.map((lead) => refsOf(lead).bid).filter((id): id is ObjectId => !!id);
    const listingIds = leads.map((lead) => refsOf(lead).listing).filter((id): id is ObjectId => !!id);

    const [jobs, bids, listings] = await Promise.all([
        asCrossTenant(JOB_REASON, () => taskRequestService.find({_id: {$in: jobIds}}, opts, JOB_POPULATE, JOB_SELECT)),
        bidIds.length ? asCrossTenant(JOB_REASON, () => bidService.find({_id: {$in: bidIds}}, opts, ["currency"])) : Promise.resolve([] as IBid[]),
        listingService.find({_id: {$in: listingIds}}, opts, null, "title"),
    ]);
    const jobById = new Map(jobs.map((job: ITaskRequest) => [job._id.toString(), job]));
    const bidById = new Map(bids.map((bid: IBid) => [bid._id.toString(), bid]));
    const titleById = new Map(listings.map((listing) => [listing._id.toString(), listing.title]));

    return leads.map((lead) => {
        const own = refsOf(lead);
        const listingId = own.listing?.toString();
        const title = listingId ? titleById.get(listingId) : undefined;
        const dto = taskLeadToDTO(lead, own.job ? jobById.get(own.job.toString()) : undefined, own.bid ? bidById.get(own.bid.toString()) : undefined);
        return listingId && title ? {...dto, listing: {_id: listingId, title}} : dto;
    });
}

/** A lead of the caller's company that the caller may act on: its provider, or an admin. */
export async function loadOwnLead(id: string, companyId: ObjectId, caller: UserContext, ctx: Ctx): Promise<ITaskLead> {
    const lead = await taskLeadService.findOne({_id: new ObjectId(id), company: companyId}, {logger: ctx.logger, languageCode: ctx.languageCode, session: ctx.session ?? undefined});
    if (!lead) throw apiValidationException("not_found", "", null, ctx.languageCode);
    assertOwnerOrAdmin(lead.provider, caller, ctx.languageCode);
    return lead;
}

/** Opening a new lead marks it viewed for its provider; nothing else changes its status by reading. */
export async function markLeadViewed(lead: ITaskLead, caller: UserContext, ctx: Ctx): Promise<ITaskLead> {
    if (lead.status !== "new" || nestedEntityToRef(lead.provider)?.toString() !== caller.userId) return lead;
    await taskLeadService.updateById(lead._id, {$set: {status: "viewed"}}, {logger: ctx.logger, languageCode: ctx.languageCode, auditUserId: caller.userId});
    lead.status = "viewed";
    return lead;
}

/** The job a lead points at, read in the operator; refused when it no longer takes quotes. */
export async function openLeadJob(lead: ITaskLead, ctx: Ctx): Promise<ITaskRequest> {
    if (lead.status !== "new" && lead.status !== "viewed") {
        throw apiValidationException("task_lead_not_open", "", null, ctx.languageCode);
    }
    const jobId = nestedEntityToRef(lead.taskRequest);
    const job = jobId ? await asCrossTenant(JOB_REASON, () =>
        taskRequestService.findById(jobId, {session: ctx.session ?? undefined, logger: ctx.logger, languageCode: ctx.languageCode})) : null;
    if (!job) throw apiValidationException("task_lead_not_open", "", null, ctx.languageCode);
    return job;
}
