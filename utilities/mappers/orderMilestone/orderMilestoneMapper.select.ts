import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";
import type {IOrderMilestone} from "@marketplaceModule/database/schemas/orderMilestone/orderMilestone";

export function orderMilestonesToSelect(milestones: IOrderMilestone[]): ApiSelectDatum[] {
    return milestones.map((milestone) => ({value: milestone._id.toString(), label: milestone.name}));
}
