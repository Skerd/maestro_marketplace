import { Schema } from "mongoose";

export function applyOrderDeliveryIndexes(schema: Schema) {
    schema.index({ order: 1, createdAt: -1 });
    schema.index({ company: 1, order: 1 });
    // submitted deliveries past the acceptance window, scanned by the auto-complete cron
    schema.index({ status: 1, createdAt: 1 });
}
