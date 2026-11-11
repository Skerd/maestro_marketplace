import {ObjectId} from "mongodb";
import {action} from "@coreModule/api/actionDecorator";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {runAfterCommit, type TransactionRequiredParams} from "@coreModule/utilities/middlewares/transactionUtils";
import type {AuthenticatedMWType} from "@coreModule/utilities/middlewares/authMW";
import type {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import {taskRequestService} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.service";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {bidService} from "@marketplaceModule/database/schemas/bid/bid.service";
import {emitNotificationEvent} from "@coreModule/domain/notifications/notificationEventBus";
import {NotificationEventCodes} from "@marketplaceModule/domain/notifications/notificationEventCodes";
import {assertOwnerOrAdmin} from "@marketplaceModule/utilities/services/marketplaceAccess";
import type {ActionMessage, SingleForm} from "armonia/src/modules/core/types/shared.types";

/** How long a task request takes bids, from creation or from being reopened. */
export const TASK_REQUEST_OPEN_DAYS = 30;

export function taskRequestExpiry(from: Date = new Date()): Date {
    return new Date(from.getTime() + TASK_REQUEST_OPEN_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Tells the providers with an active listing in the task's category and city
 * about it, once the surrounding transaction (if any) commits. Returns how many.
 */
export async function notifyMatchingProviders(
    taskRequest: ITaskRequest,
    params: AuthenticatedMWType & {session?: TransactionRequiredParams["session"]},
): Promise<number> {
    const {logger, languageCode, company, session} = params;

    const listings = await listingService.find(
        {
            company: company._id,
            category: taskRequest.category._id,
            "address.city": taskRequest.address.city._id,
            status: "active",
            provider: {$ne: taskRequest.requester._id},
        },
        {session, logger, languageCode},
        null,
        "provider",
    );
    const providerIds = [...new Set(listings.map((listing) => listing.provider._id.toString()))];
    if (providerIds.length === 0) return 0;

    await runAfterCommit(session, async () => {
        emitNotificationEvent(NotificationEventCodes.TASK_REQUEST_CREATED, {
            receiverIds: providerIds,
            payload: {
                companyId: company._id.toString(),
                languageCode,
                taskRequestId: taskRequest._id.toString(),
                taskRequestTitle: taskRequest.title,
                categoryId: taskRequest.category._id.toString(),
                cityId: taskRequest.address.city._id.toString(),
            },
        });
    });
    return providerIds.length;
}

/** Ids of the users with a pending bid on the task. */
export async function pendingBidderIds(taskRequestId: ObjectId, companyId: ObjectId, opts: {logger: AuthenticatedMWType["logger"]; languageCode: string}): Promise<string[]> {
    const bids = await bidService.find({taskRequest: taskRequestId, status: "pending", company: companyId}, opts, null, "bidder");
    return [...new Set(bids.map((bid) => bid.bidder._id.toString()))];
}

async function loadOwnTaskRequest(params: TransactionRequiredParams & SingleForm): Promise<ITaskRequest> {
    const {logger, languageCode, company, actionUserCtx, session, _id} = params;
    const taskRequest = await taskRequestService.findOneOrThrow(
        {_id: new ObjectId(_id), company: company._id},
        {session, logger, languageCode},
        null,
        "status requester title",
    );
    assertOwnerOrAdmin(taskRequest.requester, actionUserCtx, languageCode);
    if (taskRequest.status === "awarded") {
        throw apiValidationException("task_request_awarded_no_status_change", null, null, languageCode);
    }
    return taskRequest;
}

export class TaskRequestActions {
    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 30},
        transaction: true,
        schema: validateSingleForm,
        // The caller's own record, or one they are a party to: the party check below decides (D14).
        selfService: true,
    })
    async close(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & SingleForm;
        const {logger, languageCode, company, actionUserCtx, session, _id} = p;

        logger.start(`Closing task request: ${_id}...`);

        const taskRequest = await loadOwnTaskRequest(p);
        if (taskRequest.status === "open") {
            await taskRequestService.updateByIdOrThrow(taskRequest._id, {$set: {status: "closed"}}, {session, logger, languageCode, auditUserId: actionUserCtx.userId});

            const bidderIds = await pendingBidderIds(taskRequest._id, company._id, {logger, languageCode});
            if (bidderIds.length > 0) {
                await runAfterCommit(session, async () => {
                    emitNotificationEvent(NotificationEventCodes.TASK_REQUEST_CLOSED, {
                        receiverIds: bidderIds,
                        payload: {
                            companyId: company._id.toString(),
                            languageCode,
                            taskRequestId: taskRequest._id.toString(),
                            taskRequestTitle: taskRequest.title,
                        },
                    });
                });
            }
        }

        logger.finish(`Finished closing task request: ${_id}`);
        return {message: "Finished closing task request"};
    }

    /** Reopening restarts the bidding window, so an expired request is not closed again straight away. */
    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 30},
        transaction: true,
        schema: validateSingleForm,
        // The caller's own record, or one they are a party to: the party check below decides (D14).
        selfService: true,
    })
    async reopen(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & SingleForm;
        const {logger, languageCode, actionUserCtx, session, _id} = p;

        logger.start(`Reopening task request: ${_id}...`);

        const taskRequest = await loadOwnTaskRequest(p);
        if (taskRequest.status === "closed") {
            await taskRequestService.updateByIdOrThrow(
                taskRequest._id,
                {$set: {status: "open", expiresAt: taskRequestExpiry()}},
                {session, logger, languageCode, auditUserId: actionUserCtx.userId},
            );
        }

        logger.finish(`Finished reopening task request: ${_id}`);
        return {message: "Finished reopening task request"};
    }

    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 10},
        transaction: false,
        schema: validateSingleForm,
    })
    async notifyAll(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as AuthenticatedMWType & SingleForm;
        const {logger, languageCode, company, actionUserCtx, _id} = p;

        logger.start(`Notifying providers for task request: ${_id}...`);

        const taskRequest = await taskRequestService.findOneOrThrow(
            {_id: new ObjectId(_id), company: company._id},
            {logger, languageCode},
            null,
            "title category address requester status",
        );
        assertOwnerOrAdmin(taskRequest.requester, actionUserCtx, languageCode);

        const notified = await notifyMatchingProviders(taskRequest, p);

        logger.finish(`Finished notifying ${notified} provider(s) for task request: ${_id}`);
        return {message: `Notified ${notified} provider(s)`};
    }
}
