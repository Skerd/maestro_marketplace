import { Schema } from "mongoose";

export function applyOrderMilestoneIndexes(schema: Schema) {
    schema.index({ order: 1, orderIndex: 1 });
    schema.index({ company: 1, order: 1 });
}
