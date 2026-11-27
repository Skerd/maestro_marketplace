import {ObjectId} from "mongodb";
import type {HydratedDocument} from "mongoose";
import Review, {type IReview} from "./review";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {IUser} from "@coreModule/database/schemas/user/user";
import {demoSeedMarkerRegex, withDemoSeedMarker} from "@coreModule/database/demo/demoSeed";
import type {CreateOrdersResult} from "@marketplaceModule/database/schemas/order/order.defaults";
import type {CreateListingsResult} from "@marketplaceModule/database/schemas/listing/listing.defaults";
import {refreshListingRating} from "@marketplaceModule/domain/reviews/listingRating";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";

export type ReviewSeed = {
    seedKey: string;
    orderSeedKey: string;
    listingSeedKey: string;
    rating: number;
    comment: string;
};

export const defaultReviewSeeds: readonly ReviewSeed[] = [
    {
        seedKey: "review-01-renovation",
        orderSeedKey: "order-01-renovation-completed",
        listingSeedKey: "listing-01-apartment-renovation",
        rating: 5,
        comment: "Finished on the day they promised and left the flat spotless. The site manager sent photos every evening.",
    },
    {
        seedKey: "review-02-shell",
        orderSeedKey: "order-04-shell-completed",
        listingSeedKey: "listing-04-house-shell",
        rating: 4,
        comment: "Solid work and a clean site. One concrete delivery came late, but they made up the time on the roof.",
    },
    {
        seedKey: "review-03-waterproofing",
        orderSeedKey: "order-09-waterproofing-completed",
        listingSeedKey: "listing-09-terrace-waterproofing",
        rating: 5,
        comment: "Two winters of leaks fixed in a week. They flood-tested the terrace before handing over.",
    },
    {
        seedKey: "review-04-tiling",
        orderSeedKey: "order-05-tiling-accepted",
        listingSeedKey: "listing-05-tiling",
        rating: 4,
        comment: "Perfectly level floor and tidy grout lines. Would book again for the bathroom.",
    },
    {
        seedKey: "review-05-facade",
        orderSeedKey: "order-10-facade-accepted",
        listingSeedKey: "listing-10-facade-insulation",
        rating: 5,
        comment: "The house is noticeably warmer already and the new render looks great.",
    },
    {
        seedKey: "review-06-masonry",
        orderSeedKey: "order-07-masonry-in-progress",
        listingSeedKey: "listing-07-masonry-crew",
        rating: 4,
        comment: "Fast crew, straight walls. They cleaned up the dust at the end of every day.",
    },
    {
        seedKey: "review-07-roof",
        orderSeedKey: "order-08-roof-pending",
        listingSeedKey: "listing-08-roof-repair",
        rating: 3,
        comment: "The leak is fixed, but they had to come back once for a second tile. No extra charge.",
    },
    {
        seedKey: "review-08-plastering",
        orderSeedKey: "order-06-plastering-cancelled",
        listingSeedKey: "listing-06-plastering",
        rating: 2,
        comment: "We postponed and had to cancel; the visit and the quote were professional though.",
    },
    {
        seedKey: "review-09-bathroom",
        orderSeedKey: "order-02-bathroom-pending",
        listingSeedKey: "listing-02-bathroom-renovation",
        rating: 4,
        comment: "Good start — the pipework is done and they explained every step.",
    },
    {
        seedKey: "review-10-task-order",
        orderSeedKey: "order-03-bathroom-task-in-progress",
        listingSeedKey: "listing-02-bathroom-renovation",
        rating: 5,
        comment: "Hired them through a job post and the bathroom is exactly what we asked for.",
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

            // The order's own buyer reviews it (a task's order is the buyer's who posted the task).
            const orderBuyer = nestedEntityToRef(order.customer) ?? reviewer._id;
            const payload = {
                order: order._id,
                listing: listing._id,
                rating: seed.rating,
                comment: withDemoSeedMarker(seed.comment, seed.seedKey),
                reviewer: orderBuyer,
                company: company._id,
                createdBy: orderBuyer,
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

        // Seeded rows skip the review routes, so the listings' stored ratings are refreshed here (D178).
        for (const listingId of new Set(reviews.map((review) => String(review.listing)))) {
            await refreshListingRating(new ObjectId(listingId), {logger});
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
