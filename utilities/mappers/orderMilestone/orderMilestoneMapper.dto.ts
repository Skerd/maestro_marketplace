import type {IOrderMilestone} from "@marketplaceModule/database/schemas/orderMilestone/orderMilestone";
import type {OrderMilestone} from "armonia/src/modules/marketplace/api/marketplace/private/orderMilestone/orderMilestone.dto";
import type {OrderSimple} from "armonia/src/modules/marketplace/dto/order.dto";
import type {CurrencySimple} from "armonia/src/modules/core/dto/currency.dto";
import {OrderSimpleSnippet} from "@marketplaceModule/database/schemas/order/order.snippets";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {
    mapLifeCycleToDTO,
    mapOwnershipToDTO,
    mapSoftDeleteToDTO,
} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";

export function orderMilestoneToDTO(milestone: IOrderMilestone): OrderMilestone {
    return {
        _id: milestone._id.toString(),
        order: mapSnippet<OrderSimple>()(milestone.order, OrderSimpleSnippet),
        name: milestone.name,
        amount: milestone.amount,
        currency: mapSnippet<CurrencySimple>()(milestone.currency, CurrencySimpleSnippet),
        status: milestone.status,
        orderIndex: milestone.orderIndex,
        ...mapOwnershipToDTO(milestone),
        ...mapSoftDeleteToDTO(milestone),
        ...mapLifeCycleToDTO(milestone),
    };
}

export function orderMilestonesToDTO(milestones: IOrderMilestone[]): OrderMilestone[] {
    return milestones.map(orderMilestoneToDTO);
}
