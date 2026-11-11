import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";
import type {IOrderRevision} from "@marketplaceModule/database/schemas/orderRevision/orderRevision";

export function orderRevisionsToSelect(revisions: IOrderRevision[]): ApiSelectDatum[] {
    return revisions.map((revision) => ({value: revision._id.toString(), label: revision.reason}));
}
