import type {ObjectId} from "mongodb";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {companyService} from "@coreModule/database/schemas/company/company.service";
import type {IBid} from "@marketplaceModule/database/schemas/bid/bid";
import {taskLeadService} from "@marketplaceModule/database/schemas/taskLead/taskLead.service";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {bidsToDTOArray} from "@marketplaceModule/utilities/mappers/bid/bidMapper.dto";
import type {BuyerJobQuote} from "armonia/src/modules/marketplace/api/marketplace/private/taskRequest/taskRequest.dto";
import type {ClientSession} from "mongoose";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import type {serverLogger} from "@coreModule/loggers/serverLog";
import type {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import {bidService} from "@marketplaceModule/database/schemas/bid/bid.service";

export type JobBidInput = {
    bidder: ObjectId;
    /** The bidder's own company when it is not the job's (a quote from a lead, D143). */
    bidderCompany?: ObjectId;
    amount: number;
    proposal: string;
    deliveryDays: number;
};

/**
 * A bid on a job (BE-02: the one transition behind the panel's bid form and a lead's quote). The job must be open
 * and unexpired, not the bidder's own, and the bidder may have one pending bid on it. The bid is the job's company's
 * record, in the job's currency; the caller runs this in that company's tenant.
 */
export async function jobBidData(
    taskRequest: ITaskRequest,
    input: JobBidInput,
    ctx: {session?: ClientSession | null; logger: serverLogger; languageCode: string},
) {
    const {languageCode} = ctx;
    const opts = {session: ctx.session ?? undefined, logger: ctx.logger, languageCode};
    if (taskRequest.status !== "open" || taskRequest.expiresAt <= new Date()) {
        throw apiValidationException("task_request_not_open", null, null, languageCode);
    }
    if (nestedEntityToRef(taskRequest.requester)?.equals(input.bidder)) {
        throw apiValidationException("cannot_bid_on_own_task_request", null, null, languageCode);
    }
    const company = nestedEntityToRef(taskRequest.company);
    const existing = await bidService.findOne({taskRequest: taskRequest._id, bidder: input.bidder, status: "pending", company}, opts, null, "_id");
    if (existing) throw apiValidationException("bid_already_submitted", null, null, languageCode);

    return {
        taskRequest: taskRequest._id,
        bidder: input.bidder,
        ...(input.bidderCompany ? {bidderCompany: input.bidderCompany} : {}),
        amount: input.amount,
        currency: nestedEntityToRef(taskRequest.currency),
        proposal: input.proposal,
        deliveryDays: input.deliveryDays,
    };
}

const QUOTE_REASON = "a buyer compares quotes by the company and listing of each pro who answered their job";

/**
 * A job's bids as its buyer sees them (D143): each with the quoting company and, for a quote from a lead, the listing
 * the job matched with its rating. Reads the providers' companies; only names, titles and ratings leave them.
 */
export async function quotesForBuyer(bids: IBid[], ctx: {logger: serverLogger; languageCode: string}): Promise<BuyerJobQuote[]> {
    const opts = {logger: ctx.logger, languageCode: ctx.languageCode};
    const companyIds = bids.map((bid) => nestedEntityToRef(bid.bidderCompany)).filter((id): id is ObjectId => !!id);
    const bidIds = bids.map((bid) => bid._id);
    const [companies, leads] = companyIds.length ? await asCrossTenant(QUOTE_REASON, () => Promise.all([
        companyService.find({_id: {$in: companyIds}}, opts, undefined, "name"),
        taskLeadService.find({bid: {$in: bidIds}, company: {$in: companyIds}}, opts, null, "bid listing"),
    ])) : [[], []];
    const listingIds = leads.map((lead) => nestedEntityToRef(lead.listing)).filter((id): id is ObjectId => !!id);
    const listings = listingIds.length
        ? await asCrossTenant(QUOTE_REASON, () => listingService.find({_id: {$in: listingIds}}, opts, null, "title avgRating reviewCount"))
        : [];

    const companyName = new Map(companies.map((company) => [company._id.toString(), company.name]));
    const listingById = new Map(listings.map((listing) => [listing._id.toString(), listing]));
    const listingOfBid = new Map(leads.map((lead) => [nestedEntityToRef(lead.bid)?.toString(), listingById.get(nestedEntityToRef(lead.listing)?.toString() ?? "")]));

    return bidsToDTOArray(bids).map((quote, index) => {
        const companyId = nestedEntityToRef(bids[index].bidderCompany)?.toString();
        const listing = listingOfBid.get(quote._id);
        return {
            ...quote,
            ...(companyId ? {bidderCompany: {_id: companyId, name: companyName.get(companyId) ?? ""}} : {}),
            ...(listing ? {listing: {_id: listing._id.toString(), title: listing.title, avgRating: listing.avgRating, reviewCount: listing.reviewCount}} : {}),
        };
    });
}
