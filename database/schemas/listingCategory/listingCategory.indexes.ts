import { Schema } from "mongoose";

export function applyListingCategoryIndexes(ListingCategorySchema: Schema): void {
    ListingCategorySchema.index({ company: 1, slug: 1 }, { unique: true, partialFilterExpression: {deletedAt: null} });
    ListingCategorySchema.index({ company: 1, parentListingCategory: 1, order: 1 });
}
