import {Schema} from "mongoose";

export function applyMarketplaceConfigIndexes(schema: Schema): void {
    // One active config document per company.
    schema.index({company: 1}, {unique: true, partialFilterExpression: {deletedAt: null}});
}
