/**
 * Hourly job: auto-accept deliveries the customer left unanswered for
 * `autoAcceptDays` after submission, completing the order and releasing what is
 * still held. Each delivery is handled in its own transaction, and the scan pages
 * by id so deliveries that must wait (open dispute) never hide later ones.
 */

import type {ObjectId} from "mongodb";
import {CONSTANTS} from "@coreModule/environment";
import {mongooseInstance} from "@coreModule/connections/connectToMongoDb";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {flushAfterCommitTasks} from "@coreModule/utilities/middlewares/transactionUtils";
import {orderService} from "@marketplaceModule/database/schemas/order/order.service";
import {orderDeliveryService} from "@marketplaceModule/database/schemas/orderDelivery/orderDelivery.service";
import {disputeService} from "@marketplaceModule/database/schemas/dispute/dispute.service";
import {completeSubmittedDeliveryAndRelease} from "@marketplaceModule/database/schemas/order/orderEscrow";
import {getMarketplaceEnvConfig} from "@marketplaceModule/utilities/config";

const BATCH_SIZE = 200;

/** Re-reads the delivery and its order inside one transaction; returns whether the order was completed. */
async function autoAcceptDelivery(deliveryId: ObjectId, ctx: {logger: serverLogger; languageCode: string}): Promise<boolean> {
    const session = await mongooseInstance.startSession();
    let completed = false;
    try {
        await session.withTransaction(async () => {
            // A retried attempt must not keep notifications queued by the failed one
            await flushAfterCommitTasks(session, false, () => {});
            completed = false;
            const opts = {...ctx, session};

            const delivery = await orderDeliveryService.findOne({_id: deliveryId, status: "submitted"}, opts);
            if (!delivery) return;

            const companyId = delivery.company._id;
            const order = await orderService.findOne({_id: delivery.order._id, company: companyId, status: "in_progress"}, opts);
            if (!order) return;

            const openDispute = await disputeService.findOne(
                {order: order._id, status: {$in: ["open", "under_review"]}, company: companyId},
                opts,
                null,
                "_id",
            );
            if (openDispute) return;

            await completeSubmittedDeliveryAndRelease(order, delivery._id, {...opts, companyId});
            completed = true;
        });
        await flushAfterCommitTasks(session, completed, (e) => {
            ctx.logger.err(`Auto-complete notification failed for delivery ${deliveryId.toString()}: ${e instanceof Error ? e.message : String(e)}`);
        });
    } catch (e) {
        await flushAfterCommitTasks(session, false, () => {});
        throw e;
    } finally {
        await session.endSession();
    }
    return completed;
}

export async function runOrderAutoComplete(company: ObjectId, parentLogger?: serverLogger): Promise<void> {
    const logger = getLogger("order_auto_complete", parentLogger);
    const languageCode = CONSTANTS.DEFAULT_LANGUAGE ?? "en-US";
    const {autoAcceptDays} = getMarketplaceEnvConfig();

    logger.start("Running order auto-complete job...");

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - autoAcceptDays);

    let lastId: ObjectId | undefined;
    let completedCount = 0;

    try {
        for (;;) {
            const batch = await orderDeliveryService.find(
                {company, status: "submitted", createdAt: {$lte: cutoff}, ...(lastId && {_id: {$gt: lastId}})},
                {logger, languageCode},
                null,
                "_id",
                {_id: 1},
                BATCH_SIZE,
            );
            if (batch.length === 0) break;

            for (const delivery of batch) {
                try {
                    if (await autoAcceptDelivery(delivery._id, {logger, languageCode})) completedCount++;
                } catch (e: unknown) {
                    logger.err(`Auto-complete failed for delivery ${delivery._id.toString()}: ${e instanceof Error ? e.message : String(e)}`);
                }
            }
            lastId = batch[batch.length - 1]._id;
        }
    } catch (e: unknown) {
        logger.err(`Order auto-complete job error: ${e instanceof Error ? e.message : String(e)}`);
    }

    logger.finish(`Finished order auto-complete job (${completedCount} completed).`);
}
