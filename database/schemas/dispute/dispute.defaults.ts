import type {HydratedDocument} from "mongoose";
import Dispute, {type IDispute, type DisputeStatus} from "./dispute";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {IUser} from "@coreModule/database/schemas/user/user";
import {demoSeedMarkerRegex, withDemoSeedMarker} from "@coreModule/database/demo/demoSeed";
import type {CreateOrdersResult} from "@marketplaceModule/database/schemas/order/order.defaults";

export type DisputeSeed = {
    seedKey: string;
    orderSeedKey: string;
    reason: string;
    status: DisputeStatus;
    resolution?: string;
};

export const defaultDisputeSeeds: readonly DisputeSeed[] = [
    {
        seedKey: "dispute-01-website-delay",
        orderSeedKey: "order-02-website-pending",
        reason: "Demo dispute — delivery delay on website milestone.",
        status: "open",
    },
    {
        seedKey: "dispute-02-voice-cancelled",
        orderSeedKey: "order-06-voice-cancelled",
        reason: "Demo dispute — provider missed agreed recording window.",
        status: "resolved",
        resolution: "Partial refund issued; demo resolution recorded.",
    },
    {
        seedKey: "dispute-03-photo-quality",
        orderSeedKey: "order-08-photo-pending",
        reason: "Demo dispute — product photos do not match agreed white-background spec.",
        status: "under_review",
    },
    {
        seedKey: "dispute-04-logo-scope",
        orderSeedKey: "order-01-logo-completed",
        reason: "Demo dispute — scope disagreement on extra icon variants (closed).",
        status: "closed",
        resolution: "Resolved amicably with one bonus icon; case closed.",
    },
    {
        seedKey: "dispute-05-assistant-hours",
        orderSeedKey: "order-07-assistant-in-progress",
        reason: "Demo dispute — timesheet hours disputed for week 2.",
        status: "open",
    },
    {
        seedKey: "dispute-06-mobile-milestone",
        orderSeedKey: "order-09-mobile-completed",
        reason: "Demo dispute — post-delivery bug reported in checkout flow.",
        status: "resolved",
        resolution: "Hotfix deployed within 48 hours; no escrow release hold.",
    },
    {
        seedKey: "dispute-07-seo-report",
        orderSeedKey: "order-10-seo-accepted",
        reason: "Demo dispute — customer expected backlink outreach not in scope.",
        status: "under_review",
    },
    {
        seedKey: "dispute-08-video-revision",
        orderSeedKey: "order-05-video-accepted",
        reason: "Demo dispute — additional revision round requested beyond package.",
        status: "open",
    },
    {
        seedKey: "dispute-09-social-task",
        orderSeedKey: "order-03-social-in-progress",
        reason: "Demo dispute — template fonts differ from brand guide on task order.",
        status: "under_review",
    },
    {
        seedKey: "dispute-10-marketing-refund",
        orderSeedKey: "order-04-social-marketing-completed",
        reason: "Demo dispute — refund request after analytics targets missed.",
        status: "closed",
        resolution: "10% credit applied to next order; dispute closed.",
    },
];

export type CreateDisputesResult = {
    disputes: HydratedDocument<IDispute>[];
    bySeedKey: Record<string, HydratedDocument<IDispute>>;
};

export async function createDisputes(
    parentLogger: serverLogger,
    company: ICompany,
    initiator: IUser,
    orders: CreateOrdersResult,
): Promise<CreateDisputesResult> {
    const logger = getLogger("mongoDbInitialization-createDisputes", parentLogger);
    logger.start("Creating disputes...");

    const disputes: HydratedDocument<IDispute>[] = [];
    const bySeedKey: Record<string, HydratedDocument<IDispute>> = {};

    try {
        for (const seed of defaultDisputeSeeds) {
            const order = orders.bySeedKey[seed.orderSeedKey];
            if (!order) {
                logger.warn(`Skipping dispute "${seed.seedKey}": order "${seed.orderSeedKey}" not found`);
                continue;
            }

            let existing = await Dispute.findOne({
                company: company._id,
                reason: {$regex: demoSeedMarkerRegex(seed.seedKey)},
            });

            const payload = {
                order: order._id,
                initiator: initiator._id,
                company: company._id,
                reason: withDemoSeedMarker(seed.reason, seed.seedKey),
                status: seed.status,
                ...(seed.resolution ? {resolution: seed.resolution} : {}),
                createdBy: initiator._id,
            };

            if (!existing) {
                existing = await Dispute.create(payload);
                logger.debug(`Successfully created dispute '${seed.seedKey}'`);
            } else {
                existing.set(payload);
                await existing.save();
                logger.debug(`Dispute '${seed.seedKey}' already exists; updated fields`);
            }

            disputes.push(existing);
            bySeedKey[seed.seedKey] = existing;
        }

        logger.finish("Finished creating disputes!", defaultDisputeSeeds.length);
        return {disputes, bySeedKey};
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        logger.err(`Error creating disputes: ${message}`);
        logger.fail("Failed to create disputes!");
        return {disputes: [], bySeedKey: {}};
    }
}
