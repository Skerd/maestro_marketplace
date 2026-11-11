import { Schema } from "mongoose";

export function applyPromotionIndexes(PromotionSchema: Schema): void {
    PromotionSchema.index({ listing: 1, company: 1 });
    PromotionSchema.index({ company: 1, type: 1, startAt: 1, endAt: 1 });
}
