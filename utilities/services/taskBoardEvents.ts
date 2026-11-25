import type {ObjectId} from "mongodb";
import {
    MarketplaceWebSocketMessageCodes,
    TASK_BOARD_ROOM,
    taskRoom,
    type TaskQuoteReceivedPayload,
    type TaskUpdatedPayload,
} from "armonia/src/modules/marketplace/websocket/types";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {pushWebsocketMessage, pushWebsocketRoomMessage} from "@coreModule/connections/connectToWebSocketServer";
import type {serverLogger} from "@coreModule/loggers/serverLog";
import {taskRequestService} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.service";
import {findMarketplaceOperatorId} from "@marketplaceModule/utilities/services/marketplaceOperator";
import {publicTaskClause, taskQuoteStats} from "@marketplaceModule/utilities/services/publicTasks";

const EVENTS_REASON = "the task board's live updates read the operator's task (D172)";

/**
 * Tells everyone watching that a public task changed (D172): the board room and the task's own room get its public
 * state (status, quote count and the average from three quotes). A task posted on a provider's own site, one the
 * platform hid (D191), or any task of another company, is not public and is not sent. Best effort, after the commit: a failure is only logged.
 */
export async function publishTaskChange(taskId: ObjectId, logger: serverLogger): Promise<void> {
    try {
        const operatorId = await findMarketplaceOperatorId();
        const task = operatorId ? await asCrossTenant(EVENTS_REASON, () => taskRequestService.findOne(
            {_id: taskId, ...publicTaskClause(operatorId)},
            {},
            [{path: "currency", select: "decimalPlaces"}],
            "status currency",
        )) : null;
        if (!task) return;
        const quotes = (await taskQuoteStats([task])).get(taskId.toString()) ?? {count: 0};
        const payload: TaskUpdatedPayload = {taskId: taskId.toString(), status: task.status, quotes};
        pushWebsocketRoomMessage({code: MarketplaceWebSocketMessageCodes.TASK_UPDATED, payload, room: TASK_BOARD_ROOM});
        pushWebsocketRoomMessage({code: MarketplaceWebSocketMessageCodes.TASK_UPDATED, payload, room: taskRoom(taskId.toString())});
    } catch (error) {
        logger.warn(`Live task update for ${taskId.toString()} was not sent: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/** The buyer's own task page reads its quotes again when one arrives (D172). */
export function pushQuoteToBuyer(task: {_id?: ObjectId; requester?: unknown}): void {
    const buyer = nestedEntityToRef(task.requester);
    if (!buyer || !task._id) return;
    const payload: TaskQuoteReceivedPayload = {taskId: task._id.toString()};
    pushWebsocketMessage({code: MarketplaceWebSocketMessageCodes.TASK_QUOTE_RECEIVED, payload, userIds: [buyer.toString()]});
}
