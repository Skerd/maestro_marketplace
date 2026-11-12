import {Schema} from "mongoose";

export function applyTaskLeadIndexes(schema: Schema): void {
    // One lead per job and provider: re-matching a job never notifies the same provider twice.
    schema.index({company: 1, taskRequest: 1, provider: 1}, {unique: true, partialFilterExpression: {deletedAt: null}});
    schema.index({company: 1, status: 1, createdAt: -1});
    schema.index({company: 1, provider: 1, createdAt: -1});
    // The job's own view of its leads spans the provider companies.
    schema.index({taskRequest: 1, status: 1});
}
