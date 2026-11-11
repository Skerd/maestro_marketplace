import {Schema} from "mongoose";

export function applyBidIndexes(BidSchema: Schema) {
    BidSchema.index({company: 1, taskRequest: 1, createdAt: -1});
    BidSchema.index({taskRequest: 1, createdAt: 1});
    BidSchema.index({bidder: 1, createdAt: -1});
}
