import { Schema } from "mongoose";

/** One platform tree (D196): the platform company holds every row, so slugs and taxonomy ids are unique in the tree. */
export function applyListingCategoryIndexes(ListingCategorySchema: Schema): void {
    ListingCategorySchema.index({ company: 1, slug: 1 }, { unique: true, partialFilterExpression: {deletedAt: null} });
    ListingCategorySchema.index({ company: 1, parentListingCategory: 1, order: 1 });
    ListingCategorySchema.index({ company: 1, branch: 1 });
    ListingCategorySchema.index({ taxonomyId: 1 }, { unique: true, partialFilterExpression: { taxonomyId: { $type: "string" } } });
}
