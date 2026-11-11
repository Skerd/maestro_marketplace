import type {HydratedDocument} from "mongoose";
import OrderRevision, {type IOrderRevision, type OrderRevisionStatus} from "./orderRevision";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {IUser} from "@coreModule/database/schemas/user/user";
import {withDemoSeedMarker} from "@coreModule/database/demo/demoSeed";
import type {IOrderDelivery} from "@marketplaceModule/database/schemas/orderDelivery/orderDelivery";
import type {CreateOrdersResult} from "@marketplaceModule/database/schemas/order/order.defaults";

export type OrderRevisionSeed = {
    seedKey: string;
    orderSeedKey: string;
    deliverySeedKey: string;
    reason: string;
    status: OrderRevisionStatus;
};

/**
 * Revision requests the buyer raised against a delivery. Only deliveries left in
 * `revision_requested` may carry one, which today is the social-graphics order.
 */
export const defaultOrderRevisionSeeds: readonly OrderRevisionSeed[] = [
    {
        seedKey: "revision-01-social-headlines",
        orderSeedKey: "order-03-social-in-progress",
        deliverySeedKey: "delivery-02-social-first-pass",
        reason: "Headlines are too small on the story format — please match the feed sizing.",
        status: "pending",
    },
];

/**
 * Seeds order revision requests.
 *
 * Idempotency runs on the natural `{company, order, delivery}` key, which the
 * `{order, delivery}` index already covers; the marker in `reason` is only there so
 * cleanup tooling can recognise the row.
 */
export async function createOrderRevisions(
    parentLogger: serverLogger,
    company: ICompany,
    customer: IUser,
    orders: CreateOrdersResult,
    deliveries: Record<string, HydratedDocument<IOrderDelivery>>,
): Promise<HydratedDocument<IOrderRevision>[]> {
    const logger = getLogger("mongoDbInitialization-createOrderRevisions", parentLogger);
    logger.start("Creating order revisions...");

    const created: HydratedDocument<IOrderRevision>[] = [];

    try {
        for (const seed of defaultOrderRevisionSeeds) {
            const order = orders.bySeedKey[seed.orderSeedKey];
            const delivery = deliveries[seed.deliverySeedKey];
            if (!order || !delivery) {
                logger.warn(
                    `Skipping revision "${seed.seedKey}": order or delivery "${seed.deliverySeedKey}" not found`,
                );
                continue;
            }

            const payload = {
                order: order._id,
                delivery: delivery._id,
                requestedBy: customer._id,
                reason: withDemoSeedMarker(seed.reason, seed.seedKey),
                status: seed.status,
                company: company._id,
                createdBy: customer._id,
            };

            let existing = await OrderRevision.findOne({
                company: company._id,
                order: order._id,
                delivery: delivery._id,
            });

            if (!existing) {
                existing = await OrderRevision.create(payload);
                logger.debug(`Successfully created order revision '${seed.seedKey}'`);
            } else {
                existing.set(payload);
                await existing.save();
                logger.debug(`Order revision '${seed.seedKey}' already exists; updated fields`);
            }

            created.push(existing);
        }

        logger.finish("Finished creating order revisions!", created.length);
        return created;
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        logger.err(`Error creating order revisions: ${message}`);
        logger.fail("Failed to create order revisions!");
        return [];
    }
}
