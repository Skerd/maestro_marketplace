import { Schema } from "mongoose";

export function applyReviewIndexes(ReviewSchema: Schema) {
    ReviewSchema.index({ listing: 1, createdAt: -1 });
    ReviewSchema.index({ order: 1 }, { unique: true, partialFilterExpression: {deletedAt: null} });
}
