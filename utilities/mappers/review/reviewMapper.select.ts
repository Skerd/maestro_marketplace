import {IReview} from "@marketplaceModule/database/schemas/review/review";
import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";

/**
 * "4★ · Ana Hoxha · Kitchen deep clean": the rating, who wrote it and the listing, each when the reader may see it (the
 * select populates the listing and the reviewer). Without any of them, a comment excerpt.
 */
export function reviewToSelect(review: IReview): ApiSelectDatum {
    const reviewer = [review.reviewer?.name, review.reviewer?.surname].filter(Boolean).join(" ").trim();
    const listing = (review.listing?.title ?? review.listing?.name ?? "").trim();
    const parts = [typeof review.rating === "number" ? `${review.rating}★` : "", reviewer, listing].filter(Boolean);
    const comment = review.comment?.trim() ?? "";
    const fallback = comment.length > 60 ? `${comment.slice(0, 60)}…` : comment;
    return {
        value: review._id.toString(),
        label: parts.length > 0 ? parts.join(" · ") : fallback,
    };
}

export function reviewsToSelect(reviews: IReview[]): ApiSelectDatum[] {
    return reviews.map(reviewToSelect);
}
