import { Schema } from "mongoose";

export function applyOrderRevisionIndexes(schema: Schema) {
    schema.index({ order: 1, delivery: 1 });
    schema.index({ company: 1, order: 1 });
}
