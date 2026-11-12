import {ObjectId} from "mongodb";
import {getLogger} from "@coreModule/loggers/serverLog";
import {type NotificationEvent, notificationEventBus} from "@coreModule/domain/notifications/notificationEventBus";
import {NotificationEventCodes} from "@marketplaceModule/domain/notifications/notificationEventCodes";
import {createAndPushNotification} from "@coreModule/domain/notifications/notificationDomainService";
import {NotificationCategory} from "armonia/src/modules/core/api/user/private/notifications/notifications.enum";
import {NotificationImportance} from "@coreModule/database/schemas/notification/notification";

function langOpts(event: NotificationEvent) {
    return {languageCode: (event.payload.languageCode as string) ?? "en-US"};
}

type MarketplaceCode =
    | typeof NotificationEventCodes.BID_ACCEPTED
    | typeof NotificationEventCodes.BID_REJECTED
    | typeof NotificationEventCodes.TASK_REQUEST_CLOSED
    | typeof NotificationEventCodes.ORDER_CREATED_FROM_LISTING
    | typeof NotificationEventCodes.ORDER_ACCEPTED
    | typeof NotificationEventCodes.ORDER_STARTED
    | typeof NotificationEventCodes.ORDER_CANCELLED
    | typeof NotificationEventCodes.ORDER_EXTENDED
    | typeof NotificationEventCodes.ORDER_DELIVERY_SUBMITTED
    | typeof NotificationEventCodes.ORDER_DELIVERY_ACCEPTED
    | typeof NotificationEventCodes.ORDER_REVISION_REQUESTED
    | typeof NotificationEventCodes.ORDER_MILESTONE_RELEASED
    | typeof NotificationEventCodes.DISPUTE_OPENED
    | typeof NotificationEventCodes.DISPUTE_RESOLVED
    | typeof NotificationEventCodes.DISPUTE_CLOSED
    | typeof NotificationEventCodes.TASK_REQUEST_CREATED;

const DESCRIPTIONS: Record<MarketplaceCode, (payload: Record<string, unknown>) => string> = {
    [NotificationEventCodes.BID_ACCEPTED]: p =>
        `Your bid has been accepted for: ${p.taskRequestTitle as string}`,
    [NotificationEventCodes.BID_REJECTED]: p =>
        `Your bid has been rejected for: ${p.taskRequestTitle as string}`,
    [NotificationEventCodes.TASK_REQUEST_CLOSED]: p =>
        `Task request has been closed: ${p.taskRequestTitle as string}`,
    [NotificationEventCodes.ORDER_CREATED_FROM_LISTING]: p =>
        `New order received for your listing: ${p.listingTitle as string}`,
    [NotificationEventCodes.ORDER_ACCEPTED]: p =>
        `Your order has been accepted: ${p.orderName as string}`,
    [NotificationEventCodes.ORDER_STARTED]: p =>
        `Work has started on your order: ${p.orderName as string}`,
    [NotificationEventCodes.ORDER_CANCELLED]: p =>
        `Order has been cancelled: ${p.orderName as string}`,
    [NotificationEventCodes.ORDER_EXTENDED]: p =>
        `Delivery deadline extended by ${p.additionalDays as number} days for order: ${p.orderName as string}`,
    [NotificationEventCodes.ORDER_DELIVERY_SUBMITTED]: p =>
        `Delivery submitted for your order: ${p.orderName as string}. Please review and accept or request a revision.`,
    [NotificationEventCodes.ORDER_DELIVERY_ACCEPTED]: p =>
        `Delivery accepted! Order completed: ${p.orderName as string}`,
    [NotificationEventCodes.ORDER_REVISION_REQUESTED]: p =>
        `Revision requested for order: ${p.orderName as string}`,
    [NotificationEventCodes.ORDER_MILESTONE_RELEASED]: p =>
        `Milestone "${p.milestoneName as string}" released for order: ${p.orderName as string}`,
    [NotificationEventCodes.DISPUTE_OPENED]: p =>
        `A dispute has been opened on order: ${p.orderName as string}`,
    [NotificationEventCodes.DISPUTE_RESOLVED]: p =>
        `The dispute on order ${p.orderName as string} was resolved; the order is completed`,
    [NotificationEventCodes.DISPUTE_CLOSED]: p =>
        `The dispute on order ${p.orderName as string} was closed; the order is cancelled`,
    [NotificationEventCodes.TASK_REQUEST_CREATED]: p =>
        `A new task request matching your listing has been posted: ${p.taskRequestTitle as string}`,
};

const IMPORTANCE: Record<MarketplaceCode, NotificationImportance> = {
    [NotificationEventCodes.BID_ACCEPTED]: NotificationImportance.HIGH,
    [NotificationEventCodes.BID_REJECTED]: NotificationImportance.MEDIUM,
    [NotificationEventCodes.TASK_REQUEST_CLOSED]: NotificationImportance.MEDIUM,
    [NotificationEventCodes.ORDER_CREATED_FROM_LISTING]: NotificationImportance.HIGH,
    [NotificationEventCodes.ORDER_ACCEPTED]: NotificationImportance.HIGH,
    [NotificationEventCodes.ORDER_STARTED]: NotificationImportance.MEDIUM,
    [NotificationEventCodes.ORDER_CANCELLED]: NotificationImportance.HIGH,
    [NotificationEventCodes.ORDER_EXTENDED]: NotificationImportance.MEDIUM,
    [NotificationEventCodes.ORDER_DELIVERY_SUBMITTED]: NotificationImportance.HIGH,
    [NotificationEventCodes.ORDER_DELIVERY_ACCEPTED]: NotificationImportance.HIGH,
    [NotificationEventCodes.ORDER_REVISION_REQUESTED]: NotificationImportance.HIGH,
    [NotificationEventCodes.ORDER_MILESTONE_RELEASED]: NotificationImportance.HIGH,
    [NotificationEventCodes.DISPUTE_OPENED]: NotificationImportance.HIGH,
    [NotificationEventCodes.DISPUTE_RESOLVED]: NotificationImportance.HIGH,
    [NotificationEventCodes.DISPUTE_CLOSED]: NotificationImportance.HIGH,
    [NotificationEventCodes.TASK_REQUEST_CREATED]: NotificationImportance.MEDIUM,
};

/** Values for the code's translated message (`notificationTypes.json`, D117); `description` stays the English fallback. */
function paramsFor(code: MarketplaceCode, p: Record<string, unknown>): Record<string, string | number> {
    switch (code) {
        case NotificationEventCodes.BID_ACCEPTED:
        case NotificationEventCodes.BID_REJECTED:
        case NotificationEventCodes.TASK_REQUEST_CLOSED:
        case NotificationEventCodes.TASK_REQUEST_CREATED:
            return {task: String(p.taskRequestTitle ?? "")};
        case NotificationEventCodes.ORDER_CREATED_FROM_LISTING:
            return {listing: String(p.listingTitle ?? "")};
        case NotificationEventCodes.ORDER_EXTENDED:
            return {order: String(p.orderName ?? ""), days: Number(p.additionalDays ?? 0)};
        case NotificationEventCodes.ORDER_MILESTONE_RELEASED:
            return {order: String(p.orderName ?? ""), milestone: String(p.milestoneName ?? "")};
        default:
            return {order: String(p.orderName ?? "")};
    }
}

function contentFor(code: MarketplaceCode, payload: Record<string, unknown>): Record<string, unknown> {
    switch (code) {
        case NotificationEventCodes.BID_ACCEPTED:
        case NotificationEventCodes.BID_REJECTED:
            return {
                bidId: payload.bidId,
                taskRequestId: payload.taskRequestId,
                taskRequestTitle: payload.taskRequestTitle,
                // A quote placed from a lead opens that lead (D145).
                ...(payload.leadId ? {leadId: payload.leadId} : {}),
            };
        case NotificationEventCodes.TASK_REQUEST_CLOSED:
            return {taskRequestId: payload.taskRequestId, taskRequestTitle: payload.taskRequestTitle};
        case NotificationEventCodes.ORDER_CREATED_FROM_LISTING:
            return {orderId: payload.orderId, listingId: payload.listingId, listingTitle: payload.listingTitle};
        case NotificationEventCodes.ORDER_ACCEPTED:
        case NotificationEventCodes.ORDER_STARTED:
        case NotificationEventCodes.ORDER_DELIVERY_SUBMITTED:
        case NotificationEventCodes.ORDER_DELIVERY_ACCEPTED:
            return {orderId: payload.orderId, orderName: payload.orderName};
        case NotificationEventCodes.ORDER_CANCELLED:
            return {orderId: payload.orderId, orderName: payload.orderName, cancelledBy: payload.cancelledBy};
        case NotificationEventCodes.ORDER_EXTENDED:
            return {orderId: payload.orderId, orderName: payload.orderName, additionalDays: payload.additionalDays};
        case NotificationEventCodes.ORDER_REVISION_REQUESTED:
            return {orderId: payload.orderId, orderName: payload.orderName, reason: payload.reason};
        case NotificationEventCodes.ORDER_MILESTONE_RELEASED:
            return {orderId: payload.orderId, orderName: payload.orderName, milestoneName: payload.milestoneName};
        case NotificationEventCodes.DISPUTE_OPENED:
        case NotificationEventCodes.DISPUTE_RESOLVED:
        case NotificationEventCodes.DISPUTE_CLOSED:
            return {disputeId: payload.disputeId, orderId: payload.orderId, orderName: payload.orderName};
        case NotificationEventCodes.TASK_REQUEST_CREATED:
            // The lead in the provider's own company is what the notification opens (D143).
            return {
                leadId: payload.leadId,
                taskRequestId: payload.taskRequestId,
                taskRequestTitle: payload.taskRequestTitle,
                categoryId: payload.categoryId,
                ...(payload.distanceKm != null ? {distanceKm: payload.distanceKm} : {}),
            };
    }
}

function bindHandler(code: MarketplaceCode): void {
    notificationEventBus.on(code, async (event: NotificationEvent) => {
        const {receiverIds, payload} = event;
        const opts = langOpts(event);

        for (const receiverId of receiverIds) {
            try {
                await createAndPushNotification(
                    {
                        receiver: new ObjectId(receiverId),
                        company: new ObjectId(payload.companyId as string),
                        code,
                        description: DESCRIPTIONS[code](payload),
                        params: paramsFor(code, payload),
                        content: contentFor(code, payload),
                        importance: IMPORTANCE[code],
                        category: NotificationCategory.SYSTEM,
                    },
                    opts,
                );
            } catch (e) {
                getLogger("marketplace_notifications").err(`Failed to create ${code} notification for ${receiverId}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    });
}

export function registerMarketplaceNotificationHandlers(): void {
    bindHandler(NotificationEventCodes.BID_ACCEPTED);
    bindHandler(NotificationEventCodes.BID_REJECTED);
    bindHandler(NotificationEventCodes.TASK_REQUEST_CLOSED);
    bindHandler(NotificationEventCodes.ORDER_CREATED_FROM_LISTING);
    bindHandler(NotificationEventCodes.ORDER_ACCEPTED);
    bindHandler(NotificationEventCodes.ORDER_STARTED);
    bindHandler(NotificationEventCodes.ORDER_CANCELLED);
    bindHandler(NotificationEventCodes.ORDER_EXTENDED);
    bindHandler(NotificationEventCodes.ORDER_DELIVERY_SUBMITTED);
    bindHandler(NotificationEventCodes.ORDER_DELIVERY_ACCEPTED);
    bindHandler(NotificationEventCodes.ORDER_REVISION_REQUESTED);
    bindHandler(NotificationEventCodes.ORDER_MILESTONE_RELEASED);
    bindHandler(NotificationEventCodes.DISPUTE_OPENED);
    bindHandler(NotificationEventCodes.DISPUTE_RESOLVED);
    bindHandler(NotificationEventCodes.DISPUTE_CLOSED);
    bindHandler(NotificationEventCodes.TASK_REQUEST_CREATED);
}
