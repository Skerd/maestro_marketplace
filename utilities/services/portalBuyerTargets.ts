import {findPlatformCompanyId} from "@coreModule/utilities/security/platformAccess";
import {ObjectId} from "mongodb";
import type {PortalBuyerTarget} from "@coreModule/utilities/security/portalBuyer";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {orderService} from "@marketplaceModule/database/schemas/order/order.service";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {orderMilestoneService} from "@marketplaceModule/database/schemas/orderMilestone/orderMilestone.service";

/**
 * The company a portal buyer route's record lives in, for the module gate (D143, `AuthMWOptions.portalBuyer`): the
 * seller of an order or listing, the platform company for what spans sellers (D197). Reads only the record's company; the route
 * still checks that the buyer is a party to it.
 */
const REASON = "the module gate names the seller company of a portal buyer's record";

function idIn(body: Record<string, unknown>, field: string): ObjectId | undefined {
    const value = body[field];
    return typeof value === "string" && ObjectId.isValid(value) ? new ObjectId(value) : undefined;
}

/** The seller of the order named by `field` (an order action's `_id`, a review's or dispute's `order`). */
export function orderSeller(field: "_id" | "order"): PortalBuyerTarget {
    return async ({body}) => {
        const id = idIn(body, field);
        if (!id) return undefined;
        const order = await asCrossTenant(REASON, () => orderService.findById(id, {}, null, "company"));
        return order ? nestedEntityToRef(order.company) : undefined;
    };
}

/** The seller of the listing a buyer orders from. */
export const listingSeller: PortalBuyerTarget = async ({body}) => {
    const id = idIn(body, "listing");
    if (!id) return undefined;
    const listing = await asCrossTenant(REASON, () => listingService.findById(id, {}, null, "company"));
    return listing ? nestedEntityToRef(listing.company) : undefined;
};

/** The seller of the order a milestone belongs to. */
export const milestoneSeller: PortalBuyerTarget = async ({body}) => {
    const id = idIn(body, "milestone");
    if (!id) return undefined;
    const milestone = await asCrossTenant(REASON, () => orderMilestoneService.findById(id, {}, null, "company"));
    return milestone ? nestedEntityToRef(milestone.company) : undefined;
};

/**
 * What spans every seller (the buyer's orders, the portal's jobs and quotes) is the platform company's (D197), which
 * answers the module gate for the portal's buyers without running the module.
 */
export const platformCompany: PortalBuyerTarget = () => findPlatformCompanyId();
