import { Schema } from "mongoose";

export function applyListingIndexes(ListingSchema: Schema): void {
    ListingSchema.index({ company: 1, createdAt: -1 });
    ListingSchema.index({ company: 1, status: 1 });
    ListingSchema.index({ provider: 1, status: 1 });
    ListingSchema.index({ company: 1, tags: 1 });
    ListingSchema.index({ company: 1, "address.city": 1 });
    // Job matching (D143) reads on-site listings of every listed company by distance, so the geo index is not
    // company-first (DB-06 exception: the query spans companies). Listings without a point are not indexed.
    ListingSchema.index({ serviceAreaPoint: "2dsphere" });
}
