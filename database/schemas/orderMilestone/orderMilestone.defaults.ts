import type {HydratedDocument} from "mongoose";
import OrderMilestone, {type IOrderMilestone, type OrderMilestoneStatus} from "./orderMilestone";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {ICurrency} from "@coreModule/database/schemas/currency/currency";
import {IUser} from "@coreModule/database/schemas/user/user";
import {demoName} from "@coreModule/utilities/helpers";
import type {CreateOrdersResult} from "@marketplaceModule/database/schemas/order/order.defaults";

export type OrderMilestoneSeed = {
    orderSeedKey: string;
    name: string;
    amount: number;
    status: OrderMilestoneStatus;
    orderIndex: number;
};

/**
 * Milestone splits for the two large orders. Amounts add up to the parent order's
 * total (website 500, mobile app 800) so the escrow figures in the panel reconcile.
 *
 * `delivered` means the provider handed the stage over; `released` means the buyer
 * released the escrow for it. The completed mobile-app order therefore has all three
 * released, while the pending website order has only its deposit released.
 */
export const defaultOrderMilestoneSeeds: readonly OrderMilestoneSeed[] = [
    {
        orderSeedKey: "order-02-website-pending",
        name: "Deposit & discovery",
        amount: 150,
        status: "released",
        orderIndex: 0,
    },
    {
        orderSeedKey: "order-02-website-pending",
        name: "Design sign-off",
        amount: 150,
        status: "delivered",
        orderIndex: 1,
    },
    {
        orderSeedKey: "order-02-website-pending",
        name: "Launch",
        amount: 200,
        status: "pending",
        orderIndex: 2,
    },
    {
        orderSeedKey: "order-09-mobile-completed",
        name: "Prototype",
        amount: 200,
        status: "released",
        orderIndex: 0,
    },
    {
        orderSeedKey: "order-09-mobile-completed",
        name: "Beta build",
        amount: 300,
        status: "released",
        orderIndex: 1,
    },
    {
        orderSeedKey: "order-09-mobile-completed",
        name: "Store release",
        amount: 300,
        status: "released",
        orderIndex: 2,
    },
];

/**
 * Seeds milestone breakdowns for milestone-based orders.
 *
 * Idempotency runs on `{company, order, orderIndex}` — the position within an order is
 * what identifies a milestone, and the `{order, orderIndex}` index already covers it.
 * Keying on `name` instead would leave a duplicate behind whenever a stage is renamed.
 */
export async function createOrderMilestones(
    parentLogger: serverLogger,
    company: ICompany,
    customer: IUser,
    currency: ICurrency,
    orders: CreateOrdersResult,
): Promise<HydratedDocument<IOrderMilestone>[]> {
    const logger = getLogger("mongoDbInitialization-createOrderMilestones", parentLogger);
    logger.start("Creating order milestones...");

    const created: HydratedDocument<IOrderMilestone>[] = [];

    try {
        for (const seed of defaultOrderMilestoneSeeds) {
            const order = orders.bySeedKey[seed.orderSeedKey];
            if (!order) {
                logger.warn(
                    `Skipping milestone "${seed.orderSeedKey}#${seed.orderIndex}": order not found`,
                );
                continue;
            }

            const payload = {
                order: order._id,
                name: demoName(seed.name),
                amount: seed.amount,
                currency: currency._id,
                status: seed.status,
                orderIndex: seed.orderIndex,
                company: company._id,
                createdBy: customer._id,
            };

            let existing = await OrderMilestone.findOne({
                company: company._id,
                order: order._id,
                orderIndex: seed.orderIndex,
            });

            if (!existing) {
                existing = await OrderMilestone.create(payload);
                logger.debug(`Successfully created milestone '${seed.orderSeedKey}#${seed.orderIndex}'`);
            } else {
                existing.set(payload);
                await existing.save();
                logger.debug(`Milestone '${seed.orderSeedKey}#${seed.orderIndex}' already exists; updated fields`);
            }

            created.push(existing);
        }

        logger.finish("Finished creating order milestones!", created.length);
        return created;
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        logger.err(`Error creating order milestones: ${message}`);
        logger.fail("Failed to create order milestones!");
        return [];
    }
}
