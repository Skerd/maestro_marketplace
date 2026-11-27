import type {HydratedDocument} from "mongoose";
import OrderDelivery, {type IOrderDelivery, type OrderDeliveryStatus} from "./orderDelivery";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {IUser} from "@coreModule/database/schemas/user/user";
import {demoSeedMarkerRegex, withDemoSeedMarker} from "@coreModule/database/demo/demoSeed";
import type {CreateOrdersResult} from "@marketplaceModule/database/schemas/order/order.defaults";

export type OrderDeliverySeed = {
    seedKey: string;
    orderSeedKey: string;
    message: string;
    status: OrderDeliveryStatus;
};

/**
 * Deliveries the provider submitted against an order.
 *
 * Completed / accepted orders carry an accepted or submitted delivery; the
 * in-progress social-graphics order carries a `revision_requested` delivery, which is
 * what `orderRevision.defaults` hangs its revision request off.
 *
 * No `attachments` are seeded — the marketplace demo ships no delivery binaries.
 */
export const defaultOrderDeliverySeeds: readonly OrderDeliverySeed[] = [
    {
        seedKey: "delivery-01-renovation",
        orderSeedKey: "order-01-renovation-completed",
        message: "Handover done: keys, the as-built plan of the new wiring and plumbing, and the warranty sheet.",
        status: "accepted",
    },
    {
        seedKey: "delivery-02-bathroom-first-pass",
        orderSeedKey: "order-03-bathroom-task-in-progress",
        message: "Tiling and shower finished — please check the glass screen position before we seal it.",
        status: "revision_requested",
    },
    {
        seedKey: "delivery-03-waterproofing",
        orderSeedKey: "order-09-waterproofing-completed",
        message: "Membrane laid and flood-tested for 48 hours with no leak; photos and the 10-year warranty attached.",
        status: "accepted",
    },
    {
        seedKey: "delivery-04-shell",
        orderSeedKey: "order-04-shell-completed",
        message: "Shell and roof structure complete; the engineer's sign-off for the last slab is attached.",
        status: "accepted",
    },
    {
        seedKey: "delivery-05-tiling",
        orderSeedKey: "order-05-tiling-accepted",
        message: "Living room tiled; the corridor follows tomorrow once the levelling compound has set.",
        status: "submitted",
    },
    {
        seedKey: "delivery-06-masonry-day1",
        orderSeedKey: "order-07-masonry-in-progress",
        message: "Day 1: both partitions up to 1.5 m, door lintels in place. Timesheet attached.",
        status: "submitted",
    },
    {
        seedKey: "delivery-07-facade-scaffold",
        orderSeedKey: "order-10-facade-accepted",
        message: "Scaffolding up and the first two sides insulated; colour samples are on the wall for your choice.",
        status: "submitted",
    },
];

/**
 * Seeds order deliveries.
 *
 * The schema carries no `name`, and an order may hold several deliveries, so the
 * demo-seed marker rides in the free-text `message` and is matched back with
 * `demoSeedMarkerRegex` — the same trick reviews and disputes use.
 */
export async function createOrderDeliveries(
    parentLogger: serverLogger,
    company: ICompany,
    provider: IUser,
    orders: CreateOrdersResult,
): Promise<Record<string, HydratedDocument<IOrderDelivery>>> {
    const logger = getLogger("mongoDbInitialization-createOrderDeliveries", parentLogger);
    logger.start("Creating order deliveries...");

    const bySeedKey: Record<string, HydratedDocument<IOrderDelivery>> = {};

    try {
        for (const seed of defaultOrderDeliverySeeds) {
            const order = orders.bySeedKey[seed.orderSeedKey];
            if (!order) {
                logger.warn(`Skipping delivery "${seed.seedKey}": order "${seed.orderSeedKey}" not found`);
                continue;
            }

            const payload = {
                order: order._id,
                message: withDemoSeedMarker(seed.message, seed.seedKey),
                attachments: [],
                status: seed.status,
                company: company._id,
                createdBy: provider._id,
            };

            let existing = await OrderDelivery.findOne({
                company: company._id,
                order: order._id,
                message: demoSeedMarkerRegex(seed.seedKey),
            });

            if (!existing) {
                existing = await OrderDelivery.create(payload);
                logger.debug(`Successfully created order delivery '${seed.seedKey}'`);
            } else {
                existing.set(payload);
                await existing.save();
                logger.debug(`Order delivery '${seed.seedKey}' already exists; updated fields`);
            }

            bySeedKey[seed.seedKey] = existing;
        }

        logger.finish("Finished creating order deliveries!", Object.keys(bySeedKey).length);
        return bySeedKey;
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        logger.err(`Error creating order deliveries: ${message}`);
        logger.fail("Failed to create order deliveries!");
        return {};
    }
}
