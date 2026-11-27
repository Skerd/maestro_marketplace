import type {ObjectId} from "mongodb";
import type {ReportableDefinition, ReportableReadContext} from "@coreModule/domain/reports/reportables";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {runAfterCommit} from "@coreModule/utilities/middlewares/transactionUtils";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {companyService} from "@coreModule/database/schemas/company/company.service";
import {companySiteUrl} from "@coreModule/utilities/marketing/portalCompanies";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {taskRequestService} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.service";
import {bidService} from "@marketplaceModule/database/schemas/bid/bid.service";
import {reviewService} from "@marketplaceModule/database/schemas/review/review.service";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import TaskRequest from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import Bid from "@marketplaceModule/database/schemas/bid/bid";
import Review from "@marketplaceModule/database/schemas/review/review";
import {refreshListingRating} from "@marketplaceModule/domain/reviews/listingRating";
import {publishTaskChange} from "@marketplaceModule/utilities/services/taskBoardEvents";
import {REVIEW_REPORT_KIND} from "armonia/src/modules/marketplace/api/marketplace/private/review/review.dto";

/**
 * The marketplace's public things people can report to the platform (D191): a service listing, a task request (job),
 * a quote (bid) and a review. The report desk reads each by its id alone, across companies; each model applies
 * platformHiddenPlugin, so core hides one in the company that keeps it and every public read leaves it out
 * (`notHiddenByPlatform`); its company's staff still see it.
 */

const READ_REASON = "the platform's report desk reads a reported marketplace record by its id (D191)";
const EXCERPT_LENGTH = 120;

/** A short excerpt of a text a person wrote, as the desk names the thing. */
function excerpt(text: string | undefined): string {
    const flat = (text ?? "").replace(/\s+/g, " ").trim();
    return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH - 1)}…` : flat;
}

/** A page on the company's own portal site, where the reported thing is shown. */
async function sitePage(companyId: ObjectId, path: string): Promise<string | undefined> {
    const company = await companyService.findById(companyId, {}, [], "siteSlug");
    return company ? companySiteUrl({_id: company._id, siteSlug: company.siteSlug}, path) : undefined;
}

const withId = (path: string, id: ObjectId) => `${path}?${new URLSearchParams({id: id.toString()})}`;

const listing: ReportableDefinition = {
    kind: "marketplace.listing",
    typeLabel: {"en-US": "Listing", "de-CH": "Inserat", "fr-FR": "Annonce", "it-IT": "Annuncio", "sq-AL": "Listim"},
    snapshot: async ({recordId, session, logger, languageCode}: ReportableReadContext) => {
        const found = await asCrossTenant(READ_REASON, () => listingService.findById(recordId, {session, logger, languageCode, withDeleted: false}, null, "title company hiddenByPlatform"));
        const companyId = nestedEntityToRef(found?.company);
        if (!found || !companyId) return null;
        return {
            title: found.title,
            companyId,
            url: await sitePage(companyId, withId("/services/service", found._id)),
            hidden: found.hiddenByPlatform === true,
        };
    },
    model: Listing,
};

const job: ReportableDefinition = {
    kind: "marketplace.job",
    typeLabel: {"en-US": "Task request", "de-CH": "Ausschreibung", "fr-FR": "Demande de devis", "it-IT": "Richiesta di preventivo", "sq-AL": "Kërkesë për ofertë"},
    snapshot: async ({recordId, session, logger, languageCode}) => {
        const found = await asCrossTenant(READ_REASON, () => taskRequestService.findById(recordId, {session, logger, languageCode, withDeleted: false}, null, "title company requester restrictedToCompany hiddenByPlatform"));
        const companyId = nestedEntityToRef(found?.company);
        if (!found || !companyId) return null;
        const author = nestedEntityToRef(found.requester);
        return {
            title: found.title,
            companyId,
            ...(author ? {authorAccountId: author} : {}),
            // A task posted on a provider's own site has no public page (D143).
            ...(found.restrictedToCompany ? {} : {url: await sitePage(companyId, withId("/tasks/task", found._id))}),
            hidden: found.hiddenByPlatform === true,
        };
    },
    // The task board's watchers hear of a task shown again; a hidden one is never sent (`publishTaskChange`).
    model: TaskRequest,
    // The live task board drops or shows the job at once.
    onHidden: async (ctx) => {
        await runAfterCommit(ctx.session, () => publishTaskChange(ctx.recordId, ctx.logger));
    },
};

const bid: ReportableDefinition = {
    kind: "marketplace.bid",
    typeLabel: {"en-US": "Bid", "de-CH": "Offerte", "fr-FR": "Offre", "it-IT": "Offerta", "sq-AL": "Ofertë"},
    snapshot: async ({recordId, session, logger, languageCode}) => {
        const found = await asCrossTenant(READ_REASON, () => bidService.findById(recordId, {session, logger, languageCode, withDeleted: false}, null, "name proposal company bidderCompany bidder hiddenByPlatform"));
        // A quote from a lead is the quoting company's, kept next to the job in the platform company (D197).
        const companyId = nestedEntityToRef(found?.bidderCompany) ?? nestedEntityToRef(found?.company);
        if (!found || !companyId) return null;
        const author = nestedEntityToRef(found.bidder);
        return {
            title: excerpt(found.proposal) || found.name,
            companyId,
            ...(author ? {authorAccountId: author} : {}),
            hidden: found.hiddenByPlatform === true,
        };
    },
    // The task's public quote count and average leave the hidden quote out.
    model: Bid,
    // The job's live board shows its quotes again without the hidden one.
    onHidden: async (ctx) => {
        const found = await bidService.findById(ctx.recordId, {session: ctx.session}, null, "taskRequest");
        const taskId = nestedEntityToRef(found?.taskRequest);
        if (taskId) await runAfterCommit(ctx.session, () => publishTaskChange(taskId, ctx.logger));
    },
};

const review: ReportableDefinition = {
    kind: REVIEW_REPORT_KIND,
    typeLabel: {"en-US": "Review", "de-CH": "Bewertung", "fr-FR": "Avis", "it-IT": "Recensione", "sq-AL": "Vlerësim"},
    snapshot: async ({recordId, session, logger, languageCode}) => {
        const found = await asCrossTenant(READ_REASON, () => reviewService.findById(recordId, {session, logger, languageCode, withDeleted: false}, null, "rating comment listing company reviewer hiddenByPlatform"));
        const companyId = nestedEntityToRef(found?.company);
        if (!found || !companyId) return null;
        const author = nestedEntityToRef(found.reviewer);
        const listingId = nestedEntityToRef(found.listing);
        return {
            title: [`★ ${found.rating}`, excerpt(found.comment)].filter(Boolean).join(" · "),
            companyId,
            ...(author ? {authorAccountId: author} : {}),
            // Shown under the reviewed listing; a task order's review has no page of its own.
            ...(listingId ? {url: await sitePage(companyId, withId("/services/service", listingId))} : {}),
            hidden: found.hiddenByPlatform === true,
        };
    },
    // The listing's stored rating counts only the reviews the public sees.
    model: Review,
    // The listing's stars are counted again without (or with) it.
    onHidden: async (ctx) => {
        const found = await reviewService.findById(ctx.recordId, {session: ctx.session}, null, "listing");
        const listingId = nestedEntityToRef(found?.listing);
        if (listingId) await refreshListingRating(listingId, {session: ctx.session, logger: ctx.logger, languageCode: ctx.languageCode});
    },
};

export const marketplaceReportables: ReportableDefinition[] = [listing, job, bid, review];
