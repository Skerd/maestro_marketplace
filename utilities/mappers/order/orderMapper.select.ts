import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";
import type {IOrder} from "@marketplaceModule/database/schemas/order/order";

export function orderToSelect(order: IOrder): ApiSelectDatum {
    return {
        value: order._id.toString(),
        label: [order.name, order.listing?.title, order.taskRequest?.title].filter(Boolean).join(" - "),
    };
}

export function ordersToSelect(orders: IOrder[]): ApiSelectDatum[] {
    return orders.map(orderToSelect);
}
