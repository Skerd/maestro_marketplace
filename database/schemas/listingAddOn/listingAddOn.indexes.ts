import { Schema } from "mongoose";

export function applyListingAddOnIndexes(ListingAddOnSchema: Schema) {
    ListingAddOnSchema.index({ company: 1, listing: 1 });
    ListingAddOnSchema.index({ company: 1, provider: 1 });
    ListingAddOnSchema.index({ listing: 1 });
    ListingAddOnSchema.index({ provider: 1 });
}
