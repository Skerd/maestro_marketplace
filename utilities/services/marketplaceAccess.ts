/**
 * Who may see and change marketplace records. Admins see and manage everything
 * in the company. Everyone else sees only the orders they are a party to (and
 * the deliveries, milestones, revisions, bookings and disputes hanging off
 * them), and changes only the listings, packages, add-ons, task requests,
 * promotions and bids they own.
 */

import {ObjectId} from "mongodb";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {orderService} from "@marketplaceModule/database/schemas/order/order.service";
import {taskRequestService} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.service";
import type {CrudOptions} from "@coreModule/database/services/baseCrudService";
import type {UserContext} from "@coreModule/utilities/types/types";
import type {IOrder} from "@marketplaceModule/database/schemas/order/order";
import type {ClientSession} from "mongoose";
import type {AuthenticatedMWType} from "@coreModule/utilities/middlewares/authMW";
import {companyService} from "@coreModule/database/schemas/company/company.service";
import {inPortalPurchase, isPortalPurchase} from "@coreModule/utilities/marketing/portalStorefront";

/** The two facts every rule below needs; the API passes its UserContext, the assistant its access decision. */
type Caller = Pick<UserContext, "userId" | "isAdmin">;

/** Throws unless the caller is an admin or the user `ownerRef` points at. */
export function assertOwnerOrAdmin(ownerRef: unknown, actionUserCtx: Caller, languageCode: string): void {
    if (actionUserCtx.isAdmin) return;
    if (nestedEntityToRef(ownerRef)?.toString() !== actionUserCtx.userId) {
        throw apiValidationException("user_permissions_not_sufficient", null, null, languageCode);
    }
}

/** Order filter limiting a non-admin to the orders they are a party to. */
export function orderPartyFilter(actionUserCtx: Caller): Record<string, unknown> {
    if (actionUserCtx.isAdmin) return {};
    const userId = new ObjectId(actionUserCtx.userId);
    return {$or: [{customer: userId}, {provider: userId}]};
}

/**
 * A buyer acting on their own services order from the portal zone (D16, TD-B93): the order belongs to its seller, so
 * `work` runs on the portal marketplace with `params.company` set to that seller, and every read and write it does
 * names the seller. Only the order's customer gets this; anyone else, and any request outside the portal, runs `work`
 * as before in the request's tenant, so seller-side work stays tenant-only. `orderRef` resolves the order's id (a
 * milestone action finds it from the milestone).
 */
export async function asPortalBuyer<P extends AuthenticatedMWType & {session?: ClientSession}, R>(
    params: P,
    orderRef: () => Promise<unknown>,
    work: (params: P) => Promise<R>,
): Promise<R> {
    if (!isPortalPurchase(params.origin)) return work(params);
    const {session, languageCode} = params;
    const sellerId = await inPortalPurchase(true, async () => {
        const orderId = nestedEntityToRef(await orderRef());
        if (!orderId) return undefined;
        const order = await orderService.findOne({_id: orderId, customer: new ObjectId(params.actionUserCtx.userId)}, {session}, null, "company");
        return order ? nestedEntityToRef(order.company) : undefined;
    });
    if (!sellerId || sellerId.toString() === String(params.company._id)) return work(params);
    const seller = await companyService.findByIdOrThrow(sellerId, {session, languageCode}, [], "name isActive modules isPlatformOwner");
    return inPortalPurchase(true, () => work({...params, company: seller}));
}

export function isOrderParty(order: IOrder, userId: string, role: "customer" | "provider"): boolean {
    return nestedEntityToRef(order[role])?.toString() === userId;
}

/** Filter for records with an `order` ref: non-admins see only those of their own orders. */
export async function orderChildFilter(
    companyId: ObjectId,
    actionUserCtx: Caller,
    opts: CrudOptions,
): Promise<Record<string, unknown>> {
    if (actionUserCtx.isAdmin) return {};
    const orders = await orderService.find({company: companyId, ...orderPartyFilter(actionUserCtx)}, opts, null, "_id");
    return {order: {$in: orders.map((order) => order._id)}};
}

/**
 * Bids are private to the bidder and the task requester: a non-admin sees their
 * own bids and the bids on their own task requests, never a competitor's.
 */
export async function bidVisibilityFilter(
    companyId: ObjectId,
    actionUserCtx: Caller,
    opts: CrudOptions,
): Promise<Record<string, unknown>> {
    if (actionUserCtx.isAdmin) return {};
    const userId = new ObjectId(actionUserCtx.userId);
    const myTaskRequests = await taskRequestService.find({company: companyId, requester: userId}, opts, null, "_id");
    return {$or: [{bidder: userId}, {taskRequest: {$in: myTaskRequests.map((taskRequest) => taskRequest._id)}}]};
}
