import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";
import {IBid} from "@marketplaceModule/database/schemas/bid/bid";

export function bidToSelect(bid: IBid): ApiSelectDatum {
    const label = [bid.name, bid.taskRequest?.title, `${bid.currency?.symbol}${bid.amount}`].filter(Boolean).map(x => x.trim()).join(" - ") || bid.name || "";
    return {
        value: bid._id.toString(),
        label: label
    };
}

export function bidsToSelect(bids: IBid[]): ApiSelectDatum[] {
    return bids.map(bidToSelect);
}