import { Schema } from "mongoose";

export function applyListingIndexes(ListingSchema: Schema): void {
    ListingSchema.index({ company: 1, createdAt: -1 });
    ListingSchema.index({ company: 1, status: 1 });
    ListingSchema.index({ provider: 1, status: 1 });
    ListingSchema.index({ company: 1, tags: 1 });
    ListingSchema.index({ company: 1, "address.city": 1 });
}
