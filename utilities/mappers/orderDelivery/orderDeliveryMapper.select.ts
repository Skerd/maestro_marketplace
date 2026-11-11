import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";
import type {IOrderDelivery} from "@marketplaceModule/database/schemas/orderDelivery/orderDelivery";

export function orderDeliveriesToSelect(deliveries: IOrderDelivery[]): ApiSelectDatum[] {
    return deliveries.map((delivery) => ({value: delivery._id.toString(), label: delivery.status}));
}
