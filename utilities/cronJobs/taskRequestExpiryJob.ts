/**
 * Hourly job: close open TaskRequests whose expiresAt has passed and tell the
 * users still waiting on a bid, as a manual close does.
 */

import type { ObjectId } from "mongodb";
import { CONSTANTS } from "@coreModule/environment";
import { getLogger, serverLogger } from "@coreModule/loggers/serverLog";
import { emitNotificationEvent } from "@coreModule/domain/notifications/notificationEventBus";
import { taskRequestService } from "@marketplaceModule/database/schemas/taskRequest/taskRequest.service";
import { pendingBidderIds } from "@marketplaceModule/database/schemas/taskRequest/taskRequest.actions";
import { NotificationEventCodes } from "@marketplaceModule/domain/notifications/notificationEventCodes";

export async function runTaskRequestExpiry(company: ObjectId, parentLogger?: serverLogger): Promise<void> {
    const logger = getLogger("task_request_expiry", parentLogger);
    const lang = CONSTANTS.DEFAULT_LANGUAGE ?? "en-US";

    logger.start("Running task request expiry job...");

    try {
        const now = new Date();

        const expiredRequests = await taskRequestService.find(
            { company, status: "open", expiresAt: { $lte: now } },
            { logger, languageCode: lang },
            null,
            "_id title company",
            { expiresAt: 1 },
            500,
            0
        );

        for (const req of expiredRequests) {
            try {
                await taskRequestService.updateById(
                    req._id,
                    { $set: { status: "closed" } },
                    { logger, languageCode: lang }
                );

                const companyId = req.company._id;
                const bidderIds = await pendingBidderIds(req._id, companyId, { logger, languageCode: lang });
                if (bidderIds.length > 0) {
                    emitNotificationEvent(NotificationEventCodes.TASK_REQUEST_CLOSED, {
                        receiverIds: bidderIds,
                        payload: {
                            companyId: companyId.toString(),
                            languageCode: lang,
                            taskRequestId: req._id.toString(),
                            taskRequestTitle: req.title,
                        },
                    });
                }
                logger.debug(`Closed expired task request ${req._id.toString()}`);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                logger.err(`Failed to close task request ${req._id?.toString?.()}: ${msg}`);
            }
        }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.err(`Task request expiry job error: ${msg}`);
    }

    logger.finish("Finished task request expiry job.");
}
