import { Schema } from "mongoose";

export function applyProviderProfileIndexes(ProviderProfileSchema: Schema): void {
    ProviderProfileSchema.index({ user: 1, company: 1 }, { unique: true, partialFilterExpression: {deletedAt: null} });
    ProviderProfileSchema.index({ company: 1 });
}
