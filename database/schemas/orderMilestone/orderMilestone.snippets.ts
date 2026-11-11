import type {OrderMilestoneSimple} from "armonia/src/modules/marketplace/dto/orderMilestone.dto";
import type {IOrderMilestone} from "@marketplaceModule/database/schemas/orderMilestone/orderMilestone";
import {defineSnippet} from "@coreModule/database/utilities/snippet";

export const OrderMilestoneSimpleSnippet = defineSnippet<IOrderMilestone, OrderMilestoneSimple>()({
    keys: {
        _id: {},
        name: {},
        status: {},
        amount: {},
    },
});
