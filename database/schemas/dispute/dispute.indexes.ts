import { Schema } from "mongoose";

export function applyDisputeIndexes(DisputeSchema: Schema): void {
    DisputeSchema.index({ order: 1 }, { unique: true, partialFilterExpression: {deletedAt: null} });
    DisputeSchema.index({ company: 1, status: 1 });
    DisputeSchema.index({ initiator: 1 });
}
