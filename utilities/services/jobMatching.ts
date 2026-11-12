import {ObjectId} from "mongodb";
import type {ClientSession, PipelineStage} from "mongoose";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {allowForeignReferences, asCrossTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {runAfterCommit} from "@coreModule/utilities/middlewares/transactionUtils";
import {emitNotificationEvent} from "@coreModule/domain/notifications/notificationEventBus";
import {mediaService} from "@coreModule/database/schemas/media/media.service";
import type {serverLogger} from "@coreModule/loggers/serverLog";
import type {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {listingCategoryService} from "@marketplaceModule/database/schemas/listingCategory/listingCategory.service";
import {taskLeadService} from "@marketplaceModule/database/schemas/taskLead/taskLead.service";
import {NotificationEventCodes} from "@marketplaceModule/domain/notifications/notificationEventCodes";
import {findMarketplaceOperatorId, marketplaceCategoryClause} from "@marketplaceModule/utilities/services/marketplaceOperator";
import {marketplacePortalCompanyIds} from "@marketplaceModule/utilities/shop/marketplaceSellers";

/**
 * Job matching (D143). A job reaches the providers who do that work: an active listing in the job's category, a
 * sub-category or a parent one, and for on-site work a service area that contains the job's pin. One lead per
 * provider, the best rated and then the closest first, at most `JOB_LEAD_CAP`; each lives in the provider's company.
 */
export const JOB_LEAD_CAP = 10;
/** The largest radius a listing can declare (its SchemaDef `max`): no on-site match lies further away. */
const MAX_SERVICE_RADIUS_KM = 300;

const READ_REASON = "a portal job is matched against every listed provider company's active listings";
const LEAD_REFERENCE = {reason: "a lead in the provider's company points at the job in the marketplace operator", fields: ["TaskLead.taskRequest"]} as const;

export type JobMatch = {company: ObjectId; provider: ObjectId; listing: ObjectId; rating: number; distanceKm?: number};

type MatchContext = {logger: serverLogger; languageCode: string; session?: ClientSession | null};

/** The job's category with every category below it and above it in the shared tree, and its delivery. */
async function categoryScope(categoryId: ObjectId): Promise<{ids: ObjectId[]; delivery: string} | null> {
    const found = await listingCategoryService.find(await marketplaceCategoryClause(), {withDeleted: false}, undefined, "parentListingCategory delivery");
    const rows = found.map((row) => ({
        _id: String(row._id),
        parent: nestedEntityToRef(row.parentListingCategory)?.toString(),
        delivery: row.delivery,
    }));
    const byId = new Map(rows.map((row) => [row._id, row]));
    const own = byId.get(categoryId.toString());
    if (!own) return null;

    const ids = new Set<string>([own._id]);
    for (let parent = own.parent; parent && !ids.has(parent); parent = byId.get(parent)?.parent) ids.add(parent);
    const queue = [own._id];
    while (queue.length) {
        const current = queue.shift();
        for (const row of rows) {
            if (row.parent === current && !ids.has(row._id)) {
                ids.add(row._id);
                queue.push(row._id);
            }
        }
    }
    return {ids: [...ids].map((id) => new ObjectId(id)), delivery: own.delivery ?? "remote"};
}

/**
 * The companies whose providers a job may reach: the company a job was posted on (its own site), every company listed
 * on the portal for a job in the operator (the apex), and otherwise only the job's own company (a panel-made job).
 */
async function candidateCompanies(job: ITaskRequest): Promise<ObjectId[]> {
    const restricted = nestedEntityToRef(job.restrictedToCompany);
    // Eligibility reads every company's marketplace settings, not only the request tenant's.
    if (restricted) return asCrossTenant(READ_REASON, () => marketplacePortalCompanyIds({companyId: restricted}));
    const operatorId = await findMarketplaceOperatorId();
    const jobCompany = nestedEntityToRef(job.company);
    if (operatorId && jobCompany && operatorId.equals(jobCompany)) return asCrossTenant(READ_REASON, () => marketplacePortalCompanyIds({}));
    return jobCompany ? [jobCompany] : [];
}

/** The providers a job reaches, best first. Reads across companies; writes nothing. */
export async function findJobMatches(job: ITaskRequest, cap: number = JOB_LEAD_CAP): Promise<JobMatch[]> {
    const categoryId = nestedEntityToRef(job.category);
    const scope = categoryId ? await categoryScope(categoryId) : null;
    if (!scope) return [];
    const companies = await candidateCompanies(job);
    if (!companies.length) return [];

    const requester = nestedEntityToRef(job.requester);
    const query: Record<string, unknown> = {
        company: {$in: companies},
        status: "active",
        deletedAt: null,
        category: {$in: scope.ids},
        ...(requester ? {provider: {$ne: requester}} : {}),
    };

    const onsite = scope.delivery === "onsite";
    const {latitude, longitude} = job.address ?? {};
    if (onsite && (latitude == null || longitude == null)) return [];

    const pipeline: PipelineStage[] = onsite
        ? [
            {
                $geoNear: {
                    near: {type: "Point", coordinates: [Number(longitude), Number(latitude)]},
                    key: "serviceAreaPoint",
                    distanceField: "distanceM",
                    maxDistance: MAX_SERVICE_RADIUS_KM * 1000,
                    spherical: true,
                    query,
                },
            },
            // The pin must lie inside this listing's own area.
            {$match: {$expr: {$lte: ["$distanceM", {$multiply: ["$serviceArea.radiusKm", 1000]}]}}},
        ]
        : [{$match: query}];

    pipeline.push(
        {$sort: {avgRating: -1, ...(onsite ? {distanceM: 1} : {}), createdAt: 1}},
        {$group: {_id: {company: "$company", provider: "$provider"}, listing: {$first: "$_id"}, rating: {$first: "$avgRating"}, distanceM: {$first: "$distanceM"}}},
        {$sort: {rating: -1, distanceM: 1}},
        {$limit: cap},
    );

    const rows = await asCrossTenant(READ_REASON, () => listingService.aggregate(pipeline, {}));
    return rows.map((row: {_id: {company: ObjectId; provider: ObjectId}; listing: ObjectId; rating?: number; distanceM?: number}) => ({
        company: row._id.company,
        provider: row._id.provider,
        listing: row.listing,
        rating: row.rating ?? 0,
        ...(row.distanceM != null ? {distanceKm: Math.round(row.distanceM / 100) / 10} : {}),
    }));
}

/**
 * Gives each matched provider a lead in their own company, shares the job's photos with that company, and notifies the
 * provider after the commit. A provider who already has a lead for the job is left alone, so re-matching only reaches
 * new ones. Returns how many providers this call reached.
 */
export async function createJobLeads(job: ITaskRequest, ctx: MatchContext): Promise<number> {
    const {logger, languageCode, session} = ctx;
    const matches = await findJobMatches(job);
    if (!matches.length) return 0;

    const media = [job.mainImage, ...(job.imageGallery ?? []), ...(job.videoGallery ?? [])]
        .map((ref) => nestedEntityToRef(ref))
        .filter((id): id is ObjectId => !!id);

    const created: {company: ObjectId; provider: ObjectId; lead: ObjectId; distanceKm?: number}[] = [];
    for (const match of matches) {
        const lead = await withTenant(match.company, () => allowForeignReferences(LEAD_REFERENCE, async () => {
            const existing = await taskLeadService.findOne({company: match.company, taskRequest: job._id, provider: match.provider}, {session}, null, "_id");
            if (existing) return null;
            return taskLeadService.create(
                {
                    company: match.company,
                    taskRequest: job._id,
                    provider: match.provider,
                    listing: match.listing,
                    ...(match.distanceKm != null ? {distanceKm: match.distanceKm} : {}),
                    status: "new",
                    createdBy: match.provider,
                },
                {session, logger, languageCode},
            );
        }), "marketplace");
        if (lead) created.push({company: match.company, provider: match.provider, lead: lead._id, distanceKm: match.distanceKm});
    }
    if (!created.length) return 0;

    if (media.length) {
        // The provider's staff open the job's photos through the private media route, like a shared request file.
        const companies = [...new Set(created.map((row) => row.company.toString()))].map((id) => new ObjectId(id));
        await asCrossTenant("a lead's company sees the job's photos", () =>
            mediaService.updateMany({_id: {$in: media}}, {$addToSet: {sharedWithCompanies: {$each: companies}}}, {session}));
    }

    await runAfterCommit(session ?? undefined, async () => {
        for (const row of created) {
            emitNotificationEvent(NotificationEventCodes.TASK_REQUEST_CREATED, {
                receiverIds: [row.provider.toString()],
                payload: {
                    companyId: row.company.toString(),
                    languageCode,
                    leadId: row.lead.toString(),
                    taskRequestId: job._id.toString(),
                    taskRequestTitle: job.title,
                    categoryId: nestedEntityToRef(job.category)?.toString(),
                    ...(row.distanceKm != null ? {distanceKm: row.distanceKm} : {}),
                },
            });
        }
    });
    logger.debug(`Job ${job._id.toString()} reached ${created.length} new provider(s)`);
    return created.length;
}
