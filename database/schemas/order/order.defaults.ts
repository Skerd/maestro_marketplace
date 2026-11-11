import dayjs from "dayjs";
import type {HydratedDocument} from "mongoose";
import Order, {type IOrder, type OrderStatus} from "./order";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {IUser} from "@coreModule/database/schemas/user/user";
import {ICurrency} from "@coreModule/database/schemas/currency/currency";
import {demoSeedName, demoSeedNameCandidates} from "@coreModule/database/demo/demoSeed";
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
        seedKey: "order-01-logo-completed",
        listingSeedKey: "listing-01-logo-design",
        amount: 99,
        status: "completed",
        note: "Please prioritize a wordmark that works on light and dark backgrounds.",
    },
    {
        seedKey: "order-02-website-pending",
        listingSeedKey: "listing-02-website-dev",
        amount: 500,
        status: "pending",
        deliveryDaysFromNow: 14,
        note: "Marketing site for our Tirana boutique — CMS pages and contact form required.",
    },
    {
        seedKey: "order-03-social-in-progress",
        taskRequestSeedKey: "task-02-social-graphics",
        bidSeedKey: "bid-02-social-graphics",
        amount: 150,
        status: "in_progress",
        deliveryDaysFromNow: 7,
        note: "Coffee shop launch; keep templates editable in Canva where possible.",
    },
    {
        seedKey: "order-04-social-marketing-completed",
        listingSeedKey: "listing-04-social-media",
        amount: 200,
        status: "completed",
        note: "Instagram-first month; captions should sound warm and local.",
    },
    {
        seedKey: "order-05-video-accepted",
        listingSeedKey: "listing-05-video-editing",
        amount: 150,
        status: "accepted",
        deliveryDaysFromNow: 4,
        note: "Raw footage link shared in chat; prefer upbeat music bed under VO.",
    },
    {
        seedKey: "order-06-voice-cancelled",
        listingSeedKey: "listing-06-voice-over",
        amount: 75,
        status: "cancelled",
        note: "Cancelled after schedule conflict — keeping for demo history.",
    },
    {
        seedKey: "order-07-assistant-in-progress",
        listingSeedKey: "listing-07-virtual-assistant",
        amount: 250,
        status: "in_progress",
        deliveryDaysFromNow: 3,
        note: "Inbox triage Mon–Fri mornings; escalate VIP threads immediately.",
    },
    {
        seedKey: "order-08-photo-pending",
        listingSeedKey: "listing-08-product-photo",
        amount: 120,
        status: "pending",
        deliveryDaysFromNow: 6,
        note: "White-background pack shots for 12 SKUs; Amazon sizing preferred.",
    },
    {
        seedKey: "order-09-mobile-completed",
        listingSeedKey: "listing-09-mobile-apps",
        amount: 800,
        status: "completed",
        note: "Fitness MVP with Apple Health hooks; TestFlight build accepted.",
    },
    {
        seedKey: "order-10-seo-accepted",
        listingSeedKey: "listing-10-seo",
        amount: 180,
        status: "accepted",
        deliveryDaysFromNow: 5,
        note: "Focus on landing pages for EU markets; Search Console access granted.",
    },
];

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
                customer: customer._id,
                provider: provider._id,
                amount: seed.amount,
                currency: currency._id,
                status: seed.status,
                ...(seed.note ? {note: seed.note} : {}),
                ...(seed.deliveryDaysFromNow !== undefined
                    ? {deliveryDueDate: dayjs().add(seed.deliveryDaysFromNow, "day").toDate()}
                    : {}),
                company: company._id,
                createdBy: customer._id,
            };

            if (!existing) {
                existing = await Order.create(payload);
                logger.debug(`Successfully created order '${seed.seedKey}'`);
            } else {
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
            }

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
