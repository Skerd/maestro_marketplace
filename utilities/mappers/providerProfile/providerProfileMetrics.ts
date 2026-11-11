import {ObjectId} from "mongodb";
import {orderService} from "@marketplaceModule/database/schemas/order/order.service";
import {reviewService} from "@marketplaceModule/database/schemas/review/review.service";
import type {CrudOptions} from "@coreModule/database/services/baseCrudService";

export type ProviderProfileMetrics = {
    averageRating?: number;
    reviewCount?: number;
    completionRate?: number;
};

/**
 * Reputation shown on a provider profile: the average rating of the reviews on
 * the provider's orders (listing and task-request orders alike) and the share of
 * finished orders that completed rather than being cancelled. Aggregates skip the
 * soft-delete filter, so live rows are matched explicitly.
 */
export async function loadProviderProfileMetrics(
    providerId: ObjectId,
    companyId: ObjectId,
    ctx: CrudOptions,
): Promise<ProviderProfileMetrics> {
    const orderCounts: {_id: string; count: number}[] = await orderService.aggregate(
        [
            {$match: {company: companyId, provider: providerId, status: {$in: ["completed", "cancelled"]}, deletedAt: null}},
            {$group: {_id: "$status", count: {$sum: 1}}},
        ],
        ctx,
    );
    const providerOrders = await orderService.find({company: companyId, provider: providerId}, ctx, null, "_id");
    const reviewAgg: {avgRating: number; count: number}[] = await reviewService.aggregate(
        [
            {$match: {company: companyId, order: {$in: providerOrders.map((order) => order._id)}, deletedAt: null}},
            {$group: {_id: null, avgRating: {$avg: "$rating"}, count: {$sum: 1}}},
        ],
        ctx,
    );

    const completedCount = orderCounts.find((row) => row._id === "completed")?.count ?? 0;
    const cancelledCount = orderCounts.find((row) => row._id === "cancelled")?.count ?? 0;
    const finished = completedCount + cancelledCount;
    const reviewStats = reviewAgg[0];

    return {
        averageRating: reviewStats ? Math.round(reviewStats.avgRating * 10) / 10 : undefined,
        reviewCount: reviewStats?.count ?? 0,
        completionRate: finished > 0 ? Math.round((completedCount / finished) * 100) : undefined,
    };
}
