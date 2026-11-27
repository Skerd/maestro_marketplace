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
        seedKey: "dispute-01-bathroom-delay",
        orderSeedKey: "order-02-bathroom-pending",
        reason: "Demo dispute — the tiling stage started a week later than agreed.",
        status: "open",
    },
    {
        seedKey: "dispute-02-plaster-cancelled",
        orderSeedKey: "order-06-plastering-cancelled",
        reason: "Demo dispute — deposit for a cancelled plastering job.",
        status: "resolved",
        resolution: "Deposit refunded minus the site visit; demo resolution recorded.",
    },
    {
        seedKey: "dispute-03-roof-leak",
        orderSeedKey: "order-08-roof-pending",
        reason: "Demo dispute — water still came in at the chimney after the first repair.",
        status: "under_review",
    },
    {
        seedKey: "dispute-04-renovation-extras",
        orderSeedKey: "order-01-renovation-completed",
        reason: "Demo dispute — disagreement over extra sockets added during the works (closed).",
        status: "closed",
        resolution: "Settled at half the extra cost; case closed.",
    },
    {
        seedKey: "dispute-05-masonry-hours",
        orderSeedKey: "order-07-masonry-in-progress",
        reason: "Demo dispute — hours on the day-one timesheet questioned.",
        status: "open",
    },
    {
        seedKey: "dispute-06-waterproofing-drain",
        orderSeedKey: "order-09-waterproofing-completed",
        reason: "Demo dispute — a drain cover was missing after handover.",
        status: "resolved",
        resolution: "New drain cover fitted the next day; nothing withheld.",
    },
    {
        seedKey: "dispute-07-facade-colour",
        orderSeedKey: "order-10-facade-accepted",
        reason: "Demo dispute — the client expected a lighter shade than the sample.",
        status: "under_review",
    },
    {
        seedKey: "dispute-08-tiling-level",
        orderSeedKey: "order-05-tiling-accepted",
        reason: "Demo dispute — two tiles at the corridor door sit slightly high.",
        status: "open",
    },
    {
        seedKey: "dispute-09-bathroom-screen",
        orderSeedKey: "order-03-bathroom-task-in-progress",
        reason: "Demo dispute — glass screen fitted in the wrong position on the job order.",
        status: "under_review",
    },
    {
        seedKey: "dispute-10-shell-delay",
        orderSeedKey: "order-04-shell-completed",
        reason: "Demo dispute — compensation asked for a two-week delay on the roof.",
        status: "closed",
        resolution: "Agreed a 2% discount on the final milestone; dispute closed.",
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
