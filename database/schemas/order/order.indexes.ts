import { Schema } from "mongoose";

export function applyOrderIndexes(OrderSchema: Schema): void {
    OrderSchema.index({ company: 1, createdAt: -1 });
    OrderSchema.index({ company: 1, status: 1 });
    OrderSchema.index({ company: 1, customer: 1, status: 1 });
    OrderSchema.index({ company: 1, provider: 1, status: 1 });
    OrderSchema.index({ listing: 1, createdAt: -1 });
    // in-progress orders past their due date, scanned by the auto-complete cron
    OrderSchema.index({ status: 1, deliveryDueDate: 1 });
}
