import type {OrderDeliverySimple} from "armonia/src/modules/marketplace/dto/orderDelivery.dto";
import type {IOrderDelivery} from "@marketplaceModule/database/schemas/orderDelivery/orderDelivery";
import {defineSnippet} from "@coreModule/database/utilities/snippet";

export const OrderDeliverySimpleSnippet = defineSnippet<IOrderDelivery, OrderDeliverySimple>()({
    keys: {
        _id: {},
        status: {},
    },
});
