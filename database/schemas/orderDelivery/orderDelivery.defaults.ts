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
        seedKey: "delivery-01-logo",
        orderSeedKey: "order-01-logo-completed",
        message: "Final logo pack attached: master SVG, PNG exports at 3 sizes, and the usage sheet.",
        status: "accepted",
    },
    {
        seedKey: "delivery-02-social-first-pass",
        orderSeedKey: "order-03-social-in-progress",
        message: "First pass on the 12 social templates — headline sizes still need your sign-off.",
        status: "revision_requested",
    },
    {
        seedKey: "delivery-03-mobile",
        orderSeedKey: "order-09-mobile-completed",
        message: "Release build, signed APK/IPA and the handover notes for the app-store listing.",
        status: "accepted",
    },
    {
        seedKey: "delivery-04-marketing",
        orderSeedKey: "order-04-social-marketing-completed",
        message: "Month-one campaign report plus the scheduled post calendar for month two.",
        status: "accepted",
    },
    {
        seedKey: "delivery-05-video",
        orderSeedKey: "order-05-video-accepted",
        message: "Cut 1 delivered — color grade applied, captions burned in, music bed under VO.",
        status: "submitted",
    },
    {
        seedKey: "delivery-06-assistant-week1",
        orderSeedKey: "order-07-assistant-in-progress",
        message: "Week-1 timesheet and inbox summary: 42 threads triaged, 6 meetings scheduled.",
        status: "submitted",
    },
    {
        seedKey: "delivery-07-seo",
        orderSeedKey: "order-10-seo-accepted",
        message: "Technical SEO crawl + prioritized fix spreadsheet for the first 10 landing pages.",
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
