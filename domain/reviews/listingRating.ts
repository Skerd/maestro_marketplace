import type {ClientSession, ObjectId} from "mongodb";
import type {serverLogger} from "@coreModule/loggers/serverLog";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {reviewService} from "@marketplaceModule/database/schemas/review/review.service";
import {notHiddenByPlatform} from "@coreModule/database/plugins/platformHiddenPlugin";

/**
 * Stores a listing's average rating and review count from its live reviews the platform has not hidden (D191), which
 * the portal's cards, the rating filter and job matching read (D178). Called whenever a review is written, restored,
 * hidden or shown again, and by the demo seed.
 */
export async function refreshListingRating(
    listingId: ObjectId,
    ctx: {session?: ClientSession; logger?: serverLogger; languageCode?: string},
): Promise<void> {
    // Only these options: updateById spreads its options into the query.
    const opts = {session: ctx.session, logger: ctx.logger, languageCode: ctx.languageCode};
    const agg = await reviewService.aggregate(
        [
            {$match: {listing: listingId, deletedAt: null, ...notHiddenByPlatform()}},
            {$group: {_id: null, avg: {$avg: "$rating"}, count: {$sum: 1}}},
        ],
        opts,
    );
    const avg = agg.length > 0 ? Math.round(agg[0].avg * 10) / 10 : 0;
    const count = agg.length > 0 ? agg[0].count : 0;
    await listingService.updateById(listingId, {$set: {avgRating: avg, reviewCount: count}}, opts);
}
