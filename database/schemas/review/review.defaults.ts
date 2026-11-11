import type {HydratedDocument} from "mongoose";
import Review, {type IReview} from "./review";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {IUser} from "@coreModule/database/schemas/user/user";
import {demoSeedMarkerRegex, withDemoSeedMarker} from "@coreModule/database/demo/demoSeed";
import type {CreateOrdersResult} from "@marketplaceModule/database/schemas/order/order.defaults";
import type {CreateListingsResult} from "@marketplaceModule/database/schemas/listing/listing.defaults";

export type ReviewSeed = {
    seedKey: string;
    orderSeedKey: string;
    listingSeedKey: string;
    rating: number;
    comment: string;
};

export const defaultReviewSeeds: readonly ReviewSeed[] = [
    {
        seedKey: "review-01-logo",
        orderSeedKey: "order-01-logo-completed",
        listingSeedKey: "listing-01-logo-design",
        rating: 5,
        comment: "Excellent work! Very professional and delivered on time. The logo exceeded our expectations.",
    },
    {
        seedKey: "review-02-social-marketing",
        orderSeedKey: "order-04-social-marketing-completed",
        listingSeedKey: "listing-04-social-media",
        rating: 4,
        comment: "Great content calendar and visuals. Minor delay on one post batch but overall very satisfied.",
    },
    {
        seedKey: "review-03-mobile",
        orderSeedKey: "order-09-mobile-completed",
        listingSeedKey: "listing-09-mobile-apps",
        rating: 5,
        comment: "Solid React Native build, clean code, and helpful App Store submission support.",
    },
    {
        seedKey: "review-04-video",
        orderSeedKey: "order-05-video-accepted",
        listingSeedKey: "listing-05-video-editing",
        rating: 4,
        comment: "Smooth editing and good communication. Would book again for the next campaign.",
    },
    {
        seedKey: "review-05-seo",
        orderSeedKey: "order-10-seo-accepted",
        listingSeedKey: "listing-10-seo",
        rating: 5,
        comment: "Actionable audit with clear priorities. Rankings improved within three weeks.",
    },
    {
        seedKey: "review-06-assistant",
        orderSeedKey: "order-07-assistant-in-progress",
        listingSeedKey: "listing-07-virtual-assistant",
        rating: 4,
        comment: "Responsive and organized. Handles inbox and scheduling reliably each week.",
    },
    {
        seedKey: "review-07-photo",
        orderSeedKey: "order-08-photo-pending",
        listingSeedKey: "listing-08-product-photo",
        rating: 3,
        comment: "Good shots but one SKU needed a reshoot. Provider agreed to fix without extra charge.",
    },
    {
        seedKey: "review-08-voice",
        orderSeedKey: "order-06-voice-cancelled",
        listingSeedKey: "listing-06-voice-over",
        rating: 2,
        comment: "Order was cancelled after timeline slipped. Sample read was strong though.",
    },
    {
        seedKey: "review-09-website",
        orderSeedKey: "order-02-website-pending",
        listingSeedKey: "listing-02-website-dev",
        rating: 4,
        comment: "Early milestone delivery looked great. Waiting on final deployment.",
    },
    {
        seedKey: "review-10-task-order",
        orderSeedKey: "order-03-social-in-progress",
        listingSeedKey: "listing-04-social-media",
        rating: 5,
        comment: "Task-based order via bid went smoothly. Templates matched our brand perfectly.",
    },
];

export type CreateReviewsResult = {
    reviews: HydratedDocument<IReview>[];
    bySeedKey: Record<string, HydratedDocument<IReview>>;
};

export async function createReviews(
    parentLogger: serverLogger,
    company: ICompany,
    reviewer: IUser,
    orders: CreateOrdersResult,
    listings: CreateListingsResult,
): Promise<CreateReviewsResult> {
    const logger = getLogger("mongoDbInitialization-createReviews", parentLogger);
    logger.start("Creating reviews...");

    const reviews: HydratedDocument<IReview>[] = [];
    const bySeedKey: Record<string, HydratedDocument<IReview>> = {};

    try {
        for (const seed of defaultReviewSeeds) {
            const order = orders.bySeedKey[seed.orderSeedKey];
            const listing = listings.bySeedKey[seed.listingSeedKey];

            if (!order) {
                logger.warn(`Skipping review "${seed.seedKey}": order "${seed.orderSeedKey}" not found`);
                continue;
            }
            if (!listing) {
                logger.warn(`Skipping review "${seed.seedKey}": listing "${seed.listingSeedKey}" not found`);
                continue;
            }

            let existing = await Review.findOne({
                company: company._id,
                comment: {$regex: demoSeedMarkerRegex(seed.seedKey)},
            });

            const payload = {
                order: order._id,
                listing: listing._id,
                rating: seed.rating,
                comment: withDemoSeedMarker(seed.comment, seed.seedKey),
                reviewer: reviewer._id,
                company: company._id,
                createdBy: reviewer._id,
            };

            if (!existing) {
                existing = await Review.create(payload);
                logger.debug(`Successfully created review '${seed.seedKey}'`);
            } else {
                existing.set(payload);
                await existing.save();
                logger.debug(`Review '${seed.seedKey}' already exists; updated fields`);
            }

            reviews.push(existing);
            bySeedKey[seed.seedKey] = existing;
        }

        logger.finish("Finished creating reviews!", defaultReviewSeeds.length);
        return {reviews, bySeedKey};
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        logger.err(`Error creating reviews: ${message}`);
        logger.fail("Failed to create reviews!");
        return {reviews: [], bySeedKey: {}};
    }
}
