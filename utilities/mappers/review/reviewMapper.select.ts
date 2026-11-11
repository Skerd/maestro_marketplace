import {IReview} from "@marketplaceModule/database/schemas/review/review";
import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";

export function reviewToSelect(review: IReview): ApiSelectDatum {
    const reviewerName = review.reviewer
        ? [review.reviewer.name, review.reviewer.surname].filter(Boolean).join(" ").trim()
        : "";
    const label = reviewerName
        ? `${review.rating}/5 — ${reviewerName}`
        : `${review.rating}/5`;
    return {
        value: review._id.toString(),
        label,
    };
}

export function reviewsToSelect(reviews: IReview[]): ApiSelectDatum[] {
    return reviews.map(reviewToSelect);
}
