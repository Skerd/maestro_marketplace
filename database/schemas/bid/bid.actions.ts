import {ObjectId} from "mongodb";
import {action} from "@coreModule/api/actionDecorator";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {runAfterCommit, type TransactionRequiredParams} from "@coreModule/utilities/middlewares/transactionUtils";
import {bidService} from "@marketplaceModule/database/schemas/bid/bid.service";
import type {IBid} from "@marketplaceModule/database/schemas/bid/bid";
import {orderService} from "@marketplaceModule/database/schemas/order/order.service";
import {taskRequestService} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.service";
import type {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import {pendingBidderIds} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.actions";
import {emitNotificationEvent} from "@coreModule/domain/notifications/notificationEventBus";
import {NotificationEventCodes} from "@marketplaceModule/domain/notifications/notificationEventCodes";
import type {ActionMessage, SingleForm} from "armonia/src/modules/core/types/shared.types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Loads a pending bid with its task request. */
async function loadPendingBid(params: TransactionRequiredParams & SingleForm): Promise<{bid: IBid; taskRequest: ITaskRequest}> {
    const {session, logger, languageCode, company, _id} = params;
    const opts = {session, logger, languageCode};

    const bid = await bidService.findOne({_id: new ObjectId(_id), status: "pending", company: company._id}, opts);
    if (!bid) {
        throw apiValidationException("bid_not_found_or_already_processed", null, null, languageCode);
    }
    const taskRequest = await taskRequestService.findOneOrThrow({_id: bid.taskRequest._id, company: company._id}, opts);
    return {bid, taskRequest};
}

async function notifyBidders(
    params: TransactionRequiredParams,
    code: string,
    receiverIds: string[],
    bid: IBid,
    taskRequest: ITaskRequest,
): Promise<void> {
    if (receiverIds.length === 0) return;
    await runAfterCommit(params.session, async () => {
        emitNotificationEvent(code, {
            receiverIds,
            payload: {
                companyId: params.company._id.toString(),
                languageCode: params.languageCode,
                bidId: bid._id.toString(),
                taskRequestId: taskRequest._id.toString(),
                taskRequestTitle: taskRequest.title,
            },
        });
    });
}

export class BidActions {
    /** The requester awards the task: this bid is accepted, the others rejected, and a pending order is opened. */
    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 20},
        transaction: true,
        schema: validateSingleForm,
        // The caller's own record, or one they are a party to: the party check below decides (D14).
        selfService: true,
    })
    async accept(params: Record<string, any>): Promise<ActionMessage & {_id: string}> {
        const p = params as TransactionRequiredParams & SingleForm;
        const {logger, languageCode, session, company, actionUserCtx, _id} = p;
        const writeOpts = {session, logger, languageCode, auditUserId: actionUserCtx.userId};

        logger.start(`Accepting bid: ${_id}...`);

        const {bid, taskRequest} = await loadPendingBid(p);

        if (!actionUserCtx.isAdmin && taskRequest.requester._id.toString() !== actionUserCtx.userId) {
            throw apiValidationException("only_requester_can_accept", null, null, languageCode);
        }
        if (taskRequest.status !== "open" || taskRequest.expiresAt <= new Date()) {
            throw apiValidationException("task_already_awarded_or_closed", null, null, languageCode);
        }

        const otherBidderIds = (await pendingBidderIds(taskRequest._id, company._id, {logger, languageCode}))
            .filter((bidderId) => bidderId !== bid.bidder._id.toString());

        await bidService.updateByIdOrThrow(bid._id, {$set: {status: "accepted"}}, writeOpts);
        await bidService.updateMany(
            {taskRequest: taskRequest._id, status: "pending", company: company._id, _id: {$ne: bid._id}},
            {$set: {status: "rejected"}},
            writeOpts,
        );
        await taskRequestService.updateByIdOrThrow(taskRequest._id, {$set: {status: "awarded"}}, writeOpts);

        const order = await orderService.create(
            {
                taskRequest: taskRequest._id,
                bid: bid._id,
                customer: taskRequest.requester._id,
                provider: bid.bidder._id,
                amount: bid.amount,
                currency: bid.currency._id,
                status: "pending",
                company: company._id,
                ...(bid.deliveryDays > 0 && {deliveryDueDate: new Date(Date.now() + bid.deliveryDays * DAY_MS)}),
            },
            writeOpts,
        );

        await notifyBidders(p, NotificationEventCodes.BID_ACCEPTED, [bid.bidder._id.toString()], bid, taskRequest);
        await notifyBidders(p, NotificationEventCodes.BID_REJECTED, otherBidderIds, bid, taskRequest);

        logger.finish(`Successfully accepted bid: ${_id}`);

        return {message: "Bid accepted successfully", _id: order._id.toString()};
    }

    /** The requester declines a bid, or the bidder withdraws it. Only a declined bidder is notified. */
    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 20},
        transaction: true,
        schema: validateSingleForm,
        // The caller's own record, or one they are a party to: the party check below decides (D14).
        selfService: true,
    })
    async reject(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & SingleForm;
        const {logger, languageCode, session, actionUserCtx, _id} = p;

        logger.start(`Rejecting bid: ${_id}...`);

        const {bid, taskRequest} = await loadPendingBid(p);

        const isRequester = taskRequest.requester._id.toString() === actionUserCtx.userId;
        const isBidder = bid.bidder._id.toString() === actionUserCtx.userId;
        if (!actionUserCtx.isAdmin && !isRequester && !isBidder) {
            throw apiValidationException("only_requester_or_bidder_can_reject", null, null, languageCode);
        }

        await bidService.updateByIdOrThrow(bid._id, {$set: {status: "rejected"}}, {session, logger, languageCode, auditUserId: actionUserCtx.userId});

        if (!isBidder) {
            await notifyBidders(p, NotificationEventCodes.BID_REJECTED, [bid.bidder._id.toString()], bid, taskRequest);
        }

        logger.finish(`Successfully rejected bid: ${_id}`);

        return {message: "Bid rejected successfully"};
    }
}
