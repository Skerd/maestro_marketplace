import dayjs from "dayjs";
import type {HydratedDocument} from "mongoose";
import Order, {type IOrder, type OrderStatus} from "./order";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {IUser} from "@coreModule/database/schemas/user/user";
import {ICurrency} from "@coreModule/database/schemas/currency/currency";
import {demoSeedName, demoSeedNameCandidates} from "@coreModule/database/demo/demoSeed";
import {allowForeignReferences} from "@coreModule/utilities/endpoints/tenantScope";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import type {CreateListingsResult} from "@marketplaceModule/database/schemas/listing/listing.defaults";
import type {CreateTaskRequestsResult} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.defaults";
import type {CreateBidsResult} from "@marketplaceModule/database/schemas/bid/bid.defaults";

export type OrderSeed = {
    seedKey: string;
    /** Listing-based order when set. */
    listingSeedKey?: string;
    /** Task-based order when set (requires bidSeedKey). */
    taskRequestSeedKey?: string;
    bidSeedKey?: string;
    amount: number;
    status: OrderStatus;
    deliveryDaysFromNow?: number;
    /** Buyer note shown on the order sheet. */
    note?: string;
};

export const defaultOrderSeeds: readonly OrderSeed[] = [
    {
        seedKey: "order-01-renovation-completed",
        listingSeedKey: "listing-01-apartment-renovation",
        amount: 14000,
        status: "completed",
        note: "70 m² apartment in Laprakë; keep the original parquet in the bedroom and sand it instead.",
    },
    {
        seedKey: "order-02-bathroom-pending",
        listingSeedKey: "listing-02-bathroom-renovation",
        amount: 3200,
        status: "pending",
        deliveryDaysFromNow: 14,
        note: "Second-floor bathroom; the building's water is shut off only on weekday mornings.",
    },
    {
        seedKey: "order-03-bathroom-task-in-progress",
        taskRequestSeedKey: "task-02-bathroom-refit",
        bidSeedKey: "bid-02-bathroom-refit",
        amount: 3600,
        status: "in_progress",
        deliveryDaysFromNow: 10,
        note: "Walk-in shower as quoted; grey 60×120 tiles are already delivered to the flat.",
    },
    {
        seedKey: "order-04-shell-completed",
        listingSeedKey: "listing-04-house-shell",
        amount: 38000,
        status: "completed",
        note: "Plot in Mullet; the supervising engineer signs off every slab before the next floor.",
    },
    {
        seedKey: "order-05-tiling-accepted",
        listingSeedKey: "listing-05-tiling",
        amount: 880,
        status: "accepted",
        deliveryDaysFromNow: 5,
        note: "40 m² living room and corridor in Durrës, 60×60 porcelain, tiles on site.",
    },
    {
        seedKey: "order-06-plastering-cancelled",
        listingSeedKey: "listing-06-plastering",
        amount: 360,
        status: "cancelled",
        note: "Cancelled when the client postponed the renovation — kept for the demo history.",
    },
    {
        seedKey: "order-07-masonry-in-progress",
        listingSeedKey: "listing-07-masonry-crew",
        amount: 1200,
        status: "in_progress",
        deliveryDaysFromNow: 3,
        note: "Block partition walls for two new rooms on the ground floor; lintels over both doors.",
    },
    {
        seedKey: "order-08-roof-pending",
        listingSeedKey: "listing-08-roof-repair",
        amount: 450,
        status: "pending",
        deliveryDaysFromNow: 4,
        note: "Leak above the kitchen after the last storm; tiled roof, single storey.",
    },
    {
        seedKey: "order-09-waterproofing-completed",
        listingSeedKey: "listing-09-terrace-waterproofing",
        amount: 1500,
        status: "completed",
        note: "45 m² roof terrace over the living room; drains to the north-west corner.",
    },
    {
        seedKey: "order-10-facade-accepted",
        listingSeedKey: "listing-10-facade-insulation",
        amount: 8500,
        status: "accepted",
        deliveryDaysFromNow: 30,
        note: "Three-storey family house; light sand colour, white window sills.",
    },
];

/** An awarded job's order is in the provider's company; the job and its quote are in the platform company (D147). */
const AWARD_REFERENCE = {
    reason: "an awarded portal job's order, in the winning provider's company, points at the job and quote in the platform company",
    fields: ["Order.taskRequest", "Order.bid"],
} as const;

export type CreateOrdersResult = {
    orders: HydratedDocument<IOrder>[];
    bySeedKey: Record<string, HydratedDocument<IOrder>>;
};

export async function createOrders(
    parentLogger: serverLogger,
    company: ICompany,
    customer: IUser,
    provider: IUser,
    currency: ICurrency,
    listings: CreateListingsResult,
    taskRequests: CreateTaskRequestsResult,
    bids: CreateBidsResult,
): Promise<CreateOrdersResult> {
    const logger = getLogger("mongoDbInitialization-createOrders", parentLogger);
    logger.start("Creating orders...");

    const orders: HydratedDocument<IOrder>[] = [];
    const bySeedKey: Record<string, HydratedDocument<IOrder>> = {};

    try {
        for (const seed of defaultOrderSeeds) {
            let listingId;
            let taskRequestId;
            let bidId;
            // A task's order is the buyer's who posted it; a listing's is the demo customer's.
            let customerId = customer._id;

            if (seed.listingSeedKey) {
                const listing = listings.bySeedKey[seed.listingSeedKey];
                if (!listing) {
                    logger.warn(`Skipping order "${seed.seedKey}": listing "${seed.listingSeedKey}" not found`);
                    continue;
                }
                listingId = listing._id;
            }

            if (seed.taskRequestSeedKey) {
                const taskRequest = taskRequests.bySeedKey[seed.taskRequestSeedKey];
                if (!taskRequest) {
                    logger.warn(`Skipping order "${seed.seedKey}": task "${seed.taskRequestSeedKey}" not found`);
                    continue;
                }
                taskRequestId = taskRequest._id;
                customerId = nestedEntityToRef(taskRequest.requester) ?? customer._id;
            }

            if (seed.bidSeedKey) {
                const bid = bids.bySeedKey[seed.bidSeedKey];
                if (!bid) {
                    logger.warn(`Skipping order "${seed.seedKey}": bid "${seed.bidSeedKey}" not found`);
                    continue;
                }
                bidId = bid._id;
            }

            let existing = await Order.findOne({
                company: company._id,
                name: {$in: demoSeedNameCandidates(seed.seedKey)},
            });

            const payload = {
                name: demoSeedName(seed.seedKey),
                ...(listingId ? {listing: listingId} : {}),
                ...(taskRequestId ? {taskRequest: taskRequestId} : {}),
                ...(bidId ? {bid: bidId} : {}),
                customer: customerId,
                provider: provider._id,
                amount: seed.amount,
                currency: currency._id,
                status: seed.status,
                ...(seed.note ? {note: seed.note} : {}),
                ...(seed.deliveryDaysFromNow !== undefined
                    ? {deliveryDueDate: dayjs().add(seed.deliveryDaysFromNow, "day").toDate()}
                    : {}),
                company: company._id,
                createdBy: customerId,
            };

            const save = async (): Promise<HydratedDocument<IOrder>> => {
                if (!existing) {
                    const created = await Order.create(payload);
                    logger.debug(`Successfully created order '${seed.seedKey}'`);
                    return created;
                }
                const nextName = demoSeedName(seed.seedKey);
                if (existing.name !== nextName) {
                    // `name` is immutable on the schema; migrate legacy demo-seed names.
                    await Order.collection.updateOne({_id: existing._id}, {$set: {name: nextName}});
                    existing.name = nextName;
                }
                const {name: _name, ...updatable} = payload;
                existing.set(updatable);
                await existing.save();
                logger.debug(`Order '${seed.seedKey}' already exists; updated fields`);
                return existing;
            };
            existing = taskRequestId ? await allowForeignReferences(AWARD_REFERENCE, save) : await save();

            orders.push(existing);
            bySeedKey[seed.seedKey] = existing;
        }

        logger.finish("Finished creating orders!", defaultOrderSeeds.length);
        return {orders, bySeedKey};
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        logger.err(`Error creating orders: ${message}`);
        logger.fail("Failed to create orders!");
        return {orders: [], bySeedKey: {}};
    }
}
