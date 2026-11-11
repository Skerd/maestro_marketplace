import OrderDelivery, { IOrderDelivery } from "@marketplaceModule/database/schemas/orderDelivery/orderDelivery";
import { BaseCrudService } from "@coreModule/database/services/baseCrudService";

export class OrderDeliveryService extends BaseCrudService<IOrderDelivery, typeof OrderDelivery> {
    constructor() {
        super(OrderDelivery, "OrderDelivery");
    }
}

export const orderDeliveryService = new OrderDeliveryService();
