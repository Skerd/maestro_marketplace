import { Schema } from "mongoose";

export function applyTaskRequestIndexes(TaskRequestSchema: Schema): void {
    TaskRequestSchema.index({company: 1, createdAt: -1});
    TaskRequestSchema.index({createdAt: -1});
    TaskRequestSchema.index({company: 1, status: 1, createdAt: -1});
    TaskRequestSchema.index({company: 1, title: 1});
    TaskRequestSchema.index({title: 1});
    TaskRequestSchema.index({requester: 1, createdAt: -1});
    TaskRequestSchema.index({category: 1, status: 1});
    TaskRequestSchema.index({company: 1, "address.city": 1});
    TaskRequestSchema.index({"address.city": 1});
}
