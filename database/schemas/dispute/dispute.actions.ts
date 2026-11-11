import {ObjectId} from "mongodb";
import {action} from "@coreModule/api/actionDecorator";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import {resolveDisputeActionFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/dispute/resolveDispute.action.validator";
import type {ResolveDisputeFormType} from "armonia/src/modules/marketplace/api/marketplace/private/dispute/dispute.schema-def";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import type {ActionMessage, SingleForm} from "armonia/src/modules/core/types/shared.types";
import {runAfterCommit, type TransactionRequiredParams} from "@coreModule/utilities/middlewares/transactionUtils";
import type {UserContext} from "@coreModule/utilities/types/types";
import {orderDeliveryService} from "@marketplaceModule/database/schemas/orderDelivery/orderDelivery.service";
import {orderService} from "@marketplaceModule/database/schemas/order/order.service";
import {disputeService} from "@marketplaceModule/database/schemas/dispute/dispute.service";
import type {IDispute} from "@marketplaceModule/database/schemas/dispute/dispute";
import type {IOrder} from "@marketplaceModule/database/schemas/order/order";
import {refundRemainingEscrow, releaseRemainingEscrow} from "@marketplaceModule/database/schemas/order/orderEscrow";
import {emitNotificationEvent} from "@coreModule/domain/notifications/notificationEventBus";
import {NotificationEventCodes} from "@marketplaceModule/domain/notifications/notificationEventCodes";

function ensureAdmin(actionUserCtx: UserContext, languageCode: string): void {
    if (!actionUserCtx.isAdmin) {
        throw apiValidationException("only_admin_can_update_dispute", null, null, languageCode);
    }
}

/** Loads a live dispute that is still open or under review, with its order. */
async function loadOpenDispute(
    params: TransactionRequiredParams & SingleForm,
    wrongStatusKey: string,
): Promise<{dispute: IDispute; order: IOrder}> {
    const {session, logger, languageCode, company, _id} = params;
    const opts = {session, logger, languageCode};

    const dispute = await disputeService.findOneOrThrow({_id: new ObjectId(_id), company: company._id}, opts);
    // Admins also see soft-deleted rows, so the lookup alone does not rule them out
    if (dispute.deletedAt) {
        throw apiValidationException("dispute_deleted", null, null, languageCode);
    }
    if (dispute.status !== "open" && dispute.status !== "under_review") {
        throw apiValidationException(wrongStatusKey, null, null, languageCode);
    }

    const order = await orderService.findOneOrThrow({_id: dispute.order._id, company: company._id}, opts);
    return {dispute, order};
}

/** Tells both order parties how the dispute ended, once the transaction commits. */
async function notifyParties(params: TransactionRequiredParams, code: string, dispute: IDispute, order: IOrder): Promise<void> {
    await runAfterCommit(params.session, async () => {
        emitNotificationEvent(code, {
            receiverIds: [order.customer._id.toString(), order.provider._id.toString()],
            payload: {
                companyId: params.company._id.toString(),
                languageCode: params.languageCode,
                disputeId: dispute._id.toString(),
                orderId: order._id.toString(),
                orderName: order.name,
            },
        });
    });
}

export class DisputeActions {
    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 30},
        transaction: true,
        schema: validateSingleForm,
    })
    async startReview(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & SingleForm;
        const {logger, languageCode, session, actionUserCtx, _id} = p;

        logger.start(`Marking dispute under review: ${_id}...`);
        ensureAdmin(actionUserCtx, languageCode);

        const {dispute} = await loadOpenDispute(p, "dispute_start_review_requires_open_status");
        if (dispute.status !== "open") {
            throw apiValidationException("dispute_start_review_requires_open_status", null, null, languageCode);
        }

        await disputeService.updateByIdOrThrow(
            dispute._id,
            {$set: {status: "under_review"}},
            {session, logger, languageCode, auditUserId: actionUserCtx.userId},
        );

        logger.finish(`Dispute under review: ${_id}`);
        return {message: "Dispute marked as under review"};
    }

    /** Decides for the provider: the order completes and whatever is still held is released. */
    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 30},
        transaction: true,
        schema: resolveDisputeActionFormSchema,
    })
    async resolve(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & ResolveDisputeFormType;
        const {logger, languageCode, session, company, actionUserCtx, _id, resolution} = p;
        const writeOpts = {session, logger, languageCode, auditUserId: actionUserCtx.userId};

        logger.start(`Resolving dispute: ${_id}...`);
        ensureAdmin(actionUserCtx, languageCode);

        const resolutionText = resolution.trim();
        if (!resolutionText) {
            throw apiValidationException("validation_required", null, null, languageCode);
        }

        const {dispute, order} = await loadOpenDispute(p, "dispute_cannot_resolve_in_current_status");

        await disputeService.updateByIdOrThrow(dispute._id, {$set: {status: "resolved", resolution: resolutionText}}, writeOpts);

        if (order.status !== "completed" && order.status !== "cancelled") {
            const delivery = await orderDeliveryService.findOne(
                {order: order._id, status: "submitted", company: company._id},
                {session, logger, languageCode},
                null,
                "_id",
            );
            if (delivery) {
                await orderDeliveryService.updateByIdOrThrow(delivery._id, {$set: {status: "accepted"}}, writeOpts);
            }
            await orderService.updateByIdOrThrow(order._id, {$set: {status: "completed"}}, writeOpts);
            await releaseRemainingEscrow(order, {...writeOpts, companyId: company._id});
        }

        await notifyParties(p, NotificationEventCodes.DISPUTE_RESOLVED, dispute, order);

        logger.finish(`Resolved dispute ${_id}`);
        return {message: "Dispute resolved"};
    }

    /** Decides for the customer: the order is cancelled and whatever is still held is refunded. */
    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 30},
        transaction: true,
        schema: resolveDisputeActionFormSchema,
    })
    async close(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & ResolveDisputeFormType;
        const {logger, languageCode, session, company, actionUserCtx, _id, resolution} = p;
        const writeOpts = {session, logger, languageCode, auditUserId: actionUserCtx.userId};

        logger.start(`Closing dispute: ${_id}...`);
        ensureAdmin(actionUserCtx, languageCode);

        const resolutionText = resolution.trim();
        if (!resolutionText) {
            throw apiValidationException("validation_required", null, null, languageCode);
        }

        const {dispute, order} = await loadOpenDispute(p, "dispute_cannot_close_in_current_status");

        await disputeService.updateByIdOrThrow(dispute._id, {$set: {status: "closed", resolution: resolutionText}}, writeOpts);

        if (order.status !== "completed" && order.status !== "cancelled") {
            await orderService.updateByIdOrThrow(order._id, {$set: {status: "cancelled"}}, writeOpts);
            await refundRemainingEscrow(order, {...writeOpts, companyId: company._id});
        }

        await notifyParties(p, NotificationEventCodes.DISPUTE_CLOSED, dispute, order);

        logger.finish(`Closed dispute ${_id}`);
        return {message: "Dispute closed"};
    }
}
