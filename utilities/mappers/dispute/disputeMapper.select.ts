import type {IDispute} from "@marketplaceModule/database/schemas/dispute/dispute";
import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";

export function disputeToSelect(dispute: IDispute): ApiSelectDatum {
    const orderId = dispute.order?._id?.toString?.() ?? dispute.order?.toString?.() ?? "";
    const label = dispute.reason?.trim()
        ? `${dispute.status}: ${dispute.reason.slice(0, 80)}`
        : `${dispute.status}${orderId ? ` (${orderId})` : ""}`;
    return {
        value: dispute._id.toString(),
        label,
    };
}

export function disputesToSelect(disputes: IDispute[]): ApiSelectDatum[] {
    return disputes.map(disputeToSelect);
}
