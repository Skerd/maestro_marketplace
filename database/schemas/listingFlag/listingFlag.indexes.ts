import { Schema } from "mongoose";

export function applyListingFlagIndexes(ListingFlagSchema: Schema): void {
    ListingFlagSchema.index({ listing: 1, user: 1 }, { unique: true, partialFilterExpression: {deletedAt: null} });
    ListingFlagSchema.index({ company: 1, status: 1 });
}
