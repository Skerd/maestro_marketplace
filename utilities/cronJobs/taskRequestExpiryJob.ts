/**
 * Hourly job: close open TaskRequests whose expiresAt has passed, as a manual close does: their leads expire and
 * the users still waiting on a bid are told.
 */

import type { ObjectId } from "mongodb";
import { CONSTANTS } from "@coreModule/environment";
import { getLogger, serverLogger } from "@coreModule/loggers/serverLog";
import { taskRequestService } from "@marketplaceModule/database/schemas/taskRequest/taskRequest.service";
import { closeTaskRequest } from "@marketplaceModule/database/schemas/taskRequest/taskRequest.actions";

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
                await closeTaskRequest(req, req.company._id, {logger, languageCode: lang});
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
