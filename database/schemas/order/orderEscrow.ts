/**
 * Escrow paths shared by OrderActions, DisputeActions and the auto-complete cron.
 * Releases and refunds pay out of `escrowBalance` only, so milestones, final
 * acceptance, disputes and cancellation together can never exceed the hold.
 */

import type {ClientSession, ObjectId} from "mongodb";
import {orderDeliveryService} from "@marketplaceModule/database/schemas/orderDelivery/orderDelivery.service";
import {orderService} from "@marketplaceModule/database/schemas/order/order.service";
import {providerProfileService} from "@marketplaceModule/database/schemas/providerProfile/providerProfile.service";
import {createEscrowRefund, createEscrowReleaseAndFee, escrowBalance} from "@financeModule/utilities/escrowHelper";
import {emitNotificationEvent} from "@coreModule/domain/notifications/notificationEventBus";
import {runAfterCommit} from "@coreModule/utilities/middlewares/transactionUtils";
import {NotificationEventCodes} from "@marketplaceModule/domain/notifications/notificationEventCodes";
import type {serverLogger} from "@coreModule/loggers/serverLog";
import type {IOrder} from "@marketplaceModule/database/schemas/order/order";

export type OrderEscrowContext = {
    companyId: ObjectId;
    session: ClientSession;
    logger: serverLogger;
    languageCode: string;
    /** Absent for system runs (the auto-complete cron). */
    auditUserId?: string | ObjectId;
};

/** Releases everything still held for the order to its provider, minus the platform fee. */
export async function releaseRemainingEscrow(order: IOrder, ctx: OrderEscrowContext): Promise<void> {
    const {companyId, ...opts} = ctx;
    const remaining = await escrowBalance(order._id, companyId, opts);
    if (remaining <= 0) return;

    const providerStripeAccountId = await providerProfileService.getPayoutAccountId(order.provider._id, companyId, opts);
    await createEscrowReleaseAndFee(order._id, remaining, order.currency._id, companyId, opts, {providerStripeAccountId});
}

/** Refunds everything still held for the order to its customer. */
export async function refundRemainingEscrow(order: IOrder, ctx: OrderEscrowContext): Promise<void> {
    const {companyId, ...opts} = ctx;
    const remaining = await escrowBalance(order._id, companyId, opts);
    if (remaining <= 0) return;

    await createEscrowRefund(order._id, remaining, order.currency._id, companyId, opts);
}

/**
 * Marks a submitted delivery accepted, completes the order and releases what is
 * still held. The provider is notified once the transaction commits.
 */
export async function completeSubmittedDeliveryAndRelease(
    order: IOrder,
    deliveryId: ObjectId,
    ctx: OrderEscrowContext,
): Promise<void> {
    const {companyId, ...opts} = ctx;

    await orderDeliveryService.updateByIdOrThrow(deliveryId, {$set: {status: "accepted"}}, opts);
    await orderService.updateByIdOrThrow(order._id, {$set: {status: "completed"}}, opts);
    await releaseRemainingEscrow(order, ctx);

    await runAfterCommit(ctx.session, async () => {
        emitNotificationEvent(NotificationEventCodes.ORDER_DELIVERY_ACCEPTED, {
            receiverIds: [order.provider._id.toString()],
            payload: {
                companyId: companyId.toString(),
                languageCode: ctx.languageCode,
                orderId: order._id.toString(),
                orderName: order.name,
            },
        });
    });
}
