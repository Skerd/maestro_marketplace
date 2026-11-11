import OrderRevision, { IOrderRevision } from "@marketplaceModule/database/schemas/orderRevision/orderRevision";
import { BaseCrudService } from "@coreModule/database/services/baseCrudService";

export class OrderRevisionService extends BaseCrudService<IOrderRevision, typeof OrderRevision> {
    constructor() {
        super(OrderRevision, "OrderRevision");
    }
}

export const orderRevisionService = new OrderRevisionService();
