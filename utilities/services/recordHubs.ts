/**
 * Marketplace sheets as hubs (UX-03): a listing's orders, bookings, reviews and reports; a provider's listings,
 * orders, bids and reviews; a task request's bids and the order it led to. Newest first. Each list is read the way
 * its own list route reads it: only when the caller's role can read that model, with the caller's field grants
 * (SEC-09), and with that route's record filter (a non-admin sees only the orders they are a party to and what hangs
 * off them, their own reports, and the bids `bidVisibilityFilter` allows).
 */

import {ObjectId} from "mongodb";
import {readableListFetch} from "@coreModule/database/security/readableListFetch";
import type {UserContext} from "@coreModule/utilities/types/types";
import type {Listing as ListingDTO} from "armonia/src/modules/marketplace/api/marketplace/private/listing/listing.dto";
import type {ProviderProfile} from "armonia/src/modules/marketplace/api/marketplace/private/providerProfile/providerProfile.dto";
import type {TaskRequest} from "armonia/src/modules/marketplace/api/marketplace/private/taskRequest/taskRequest.dto";
import Bid from "@marketplaceModule/database/schemas/bid/bid";
import {bidService} from "@marketplaceModule/database/schemas/bid/bid.service";
import Booking from "@marketplaceModule/database/schemas/booking/booking";
import {bookingService} from "@marketplaceModule/database/schemas/booking/booking.service";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import ListingFlag from "@marketplaceModule/database/schemas/listingFlag/listingFlag";
import {listingFlagService} from "@marketplaceModule/database/schemas/listingFlag/listingFlag.service";
import Order from "@marketplaceModule/database/schemas/order/order";
import {orderService} from "@marketplaceModule/database/schemas/order/order.service";
import Review from "@marketplaceModule/database/schemas/review/review";
import {reviewService} from "@marketplaceModule/database/schemas/review/review.service";
import {bidsToDTOArray} from "@marketplaceModule/utilities/mappers/bid/bidMapper.dto";
import {bookingsToDTOArray} from "@marketplaceModule/utilities/mappers/booking/bookingMapper.dto";
import {listingsToDTO} from "@marketplaceModule/utilities/mappers/listing/listingMapper.dto";
import {listingFlagsToDTO} from "@marketplaceModule/utilities/mappers/listingFlag/listingFlagMapper.dto";
import {ordersToDTO} from "@marketplaceModule/utilities/mappers/order/orderMapper.dto";
import {reviewsToDTO} from "@marketplaceModule/utilities/mappers/review/reviewMapper.dto";
import {bidVisibilityFilter, orderPartyFilter} from "@marketplaceModule/utilities/services/marketplaceAccess";

/** The newest records of each kind; the full history stays on each list page. */
const HUB_LIMIT = 20;

type HubCtx = {companyId: ObjectId; actionUserCtx: UserContext; languageCode: string};
export type ListingHub = Pick<ListingDTO, "orders" | "bookings" | "reviews" | "flags">;
export type ProviderProfileHub = Pick<ProviderProfile, "listings" | "orders" | "bids" | "reviews">;
export type TaskRequestHub = Pick<TaskRequest, "bids" | "orders">;

/** Ids of the orders matching `filter`, for the lists that hang off orders (bookings, reviews). */
async function orderIdsOf(filter: Record<string, unknown>): Promise<ObjectId[]> {
    return (await orderService.find(filter, {}, null, "_id")).map((order) => order._id);
}

export async function listingHub(listingId: ObjectId, ctx: HubCtx): Promise<ListingHub> {
    const base = {company: ctx.companyId, deletedAt: null};
    const ordersFetch = readableListFetch(Order, ctx);
    const bookingsFetch = readableListFetch(Booking, ctx);
    const reviewsFetch = readableListFetch(Review, ctx);
    const flagsFetch = readableListFetch(ListingFlag, ctx);
    // The orders route shows a non-admin only the orders they are a party to, and the bookings route only those orders' bookings.
    const visibleOrders = {...base, listing: listingId, ...orderPartyFilter(ctx.actionUserCtx)};
    // Reports are private: a non-admin sees only their own, as on the reports list.
    const ownFlags = ctx.actionUserCtx.isAdmin ? {} : {user: new ObjectId(ctx.actionUserCtx.userId)};

    const [orders, bookings, reviews, flags] = await Promise.all([
        ordersFetch ? orderService.find(visibleOrders, {}, ordersFetch.populate, ordersFetch.select, {createdAt: -1}, HUB_LIMIT) : null,
        bookingsFetch
            ? orderIdsOf(visibleOrders).then((orderIds) =>
                bookingService.find({...base, order: {$in: orderIds}}, {}, bookingsFetch.populate, bookingsFetch.select, {startAt: -1}, HUB_LIMIT))
            : null,
        reviewsFetch ? reviewService.find({...base, listing: listingId}, {}, reviewsFetch.populate, reviewsFetch.select, {createdAt: -1}, HUB_LIMIT) : null,
        flagsFetch ? listingFlagService.find({...base, listing: listingId, ...ownFlags}, {}, flagsFetch.populate, flagsFetch.select, {createdAt: -1}, HUB_LIMIT) : null,
    ]);

    const hub: ListingHub = {};
    if (orders) hub.orders = ordersToDTO(orders);
    if (bookings) hub.bookings = bookingsToDTOArray(bookings);
    if (reviews) hub.reviews = reviewsToDTO(reviews);
    if (flags) hub.flags = listingFlagsToDTO(flags);
    return hub;
}

/** `providerId` is the profile's user: the provider of its listings and orders, the bidder of its bids. */
export async function providerProfileHub(providerId: ObjectId, ctx: HubCtx): Promise<ProviderProfileHub> {
    const base = {company: ctx.companyId, deletedAt: null};
    const listingsFetch = readableListFetch(Listing, ctx);
    const ordersFetch = readableListFetch(Order, ctx);
    const bidsFetch = readableListFetch(Bid, ctx);
    const reviewsFetch = readableListFetch(Review, ctx);

    const [listings, orders, bids, reviews] = await Promise.all([
        listingsFetch ? listingService.find({...base, provider: providerId}, {}, listingsFetch.populate, listingsFetch.select, {createdAt: -1}, HUB_LIMIT) : null,
        ordersFetch
            ? orderService.find({...base, provider: providerId, ...orderPartyFilter(ctx.actionUserCtx)}, {}, ordersFetch.populate, ordersFetch.select, {createdAt: -1}, HUB_LIMIT)
            : null,
        bidsFetch
            ? bidVisibilityFilter(ctx.companyId, ctx.actionUserCtx, {}).then((visible) =>
                bidService.find({...base, $and: [{bidder: providerId}, visible]}, {}, bidsFetch.populate, bidsFetch.select, {createdAt: -1}, HUB_LIMIT))
            : null,
        // A review names its order, not its provider; the reviews route shows every review to a role that may read them.
        reviewsFetch
            ? orderIdsOf({...base, provider: providerId}).then((orderIds) =>
                reviewService.find({...base, order: {$in: orderIds}}, {}, reviewsFetch.populate, reviewsFetch.select, {createdAt: -1}, HUB_LIMIT))
            : null,
    ]);

    const hub: ProviderProfileHub = {};
    if (listings) hub.listings = listingsToDTO(listings);
    if (orders) hub.orders = ordersToDTO(orders);
    if (bids) hub.bids = bidsToDTOArray(bids);
    if (reviews) hub.reviews = reviewsToDTO(reviews);
    return hub;
}

export async function taskRequestHub(taskRequestId: ObjectId, ctx: HubCtx): Promise<TaskRequestHub> {
    const base = {company: ctx.companyId, deletedAt: null};
    const bidsFetch = readableListFetch(Bid, ctx);
    const ordersFetch = readableListFetch(Order, ctx);

    const [bids, orders] = await Promise.all([
        bidsFetch
            ? bidVisibilityFilter(ctx.companyId, ctx.actionUserCtx, {}).then((visible) =>
                bidService.find({...base, $and: [{taskRequest: taskRequestId}, visible]}, {}, bidsFetch.populate, bidsFetch.select, {createdAt: -1}, HUB_LIMIT))
            : null,
        ordersFetch
            ? orderService.find({...base, taskRequest: taskRequestId, ...orderPartyFilter(ctx.actionUserCtx)}, {}, ordersFetch.populate, ordersFetch.select, {createdAt: -1}, HUB_LIMIT)
            : null,
    ]);

    const hub: TaskRequestHub = {};
    if (bids) hub.bids = bidsToDTOArray(bids);
    if (orders) hub.orders = ordersToDTO(orders);
    return hub;
}
