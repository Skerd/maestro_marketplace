import {Schema} from "mongoose";

export function applyMarketplaceConfigIndexes(schema: Schema): void {
    // One active config document per company.
    schema.index({company: 1}, {unique: true, partialFilterExpression: {deletedAt: null}});
    // One marketplace operator per database (D143); the lookup reads it across companies.
    schema.index({isOperator: 1}, {unique: true, partialFilterExpression: {isOperator: true, deletedAt: null}});
}
