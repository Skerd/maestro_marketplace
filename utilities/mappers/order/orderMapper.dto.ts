import type {IOrder} from "@marketplaceModule/database/schemas/order/order";
import type {BuyerServiceOrder, Order} from "armonia/src/modules/marketplace/api/marketplace/private/order/order.dto";
import type {CurrencySimple} from "armonia/src/modules/core/dto/currency.dto";
import type {SimpleUser} from "armonia/src/modules/core/dto/user.dto";
import type {ListingSimple} from "armonia/src/modules/marketplace/dto/listing.dto";
import type {TaskRequestSimple} from "armonia/src/modules/marketplace/dto/taskRequest.dto";
import type {BidSimple} from "armonia/src/modules/marketplace/dto/bid.dto";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {SimpleUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {ListingSimpleSnippet} from "@marketplaceModule/database/schemas/listing/listing.snippets";
import {TaskRequestSimpleSnippet} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.snippets";
import {BidSimpleSnippet} from "@marketplaceModule/database/schemas/bid/bid.snippets";
import {mapSnippet, nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {mapOwnershipToDTO, mapSoftDeleteToDTO, mapLifeCycleToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";

export function orderToDTO(order: IOrder, deliverySubmitted = false, hasActiveDispute = false): Order {
    return {
        _id: order._id.toString(),
        name: order.name,
        listing: mapSnippet<ListingSimple>()(order.listing, ListingSimpleSnippet),
        taskRequest: mapSnippet<TaskRequestSimple>()(order.taskRequest, TaskRequestSimpleSnippet),
        bid: mapSnippet<BidSimple>()(order.bid, BidSimpleSnippet),
        customer: mapSnippet<SimpleUser>()(order.customer, SimpleUserSnippet),
        provider: mapSnippet<SimpleUser>()(order.provider, SimpleUserSnippet),
        amount: order.amount,
        currency: mapSnippet<CurrencySimple>()(order.currency, CurrencySimpleSnippet),
        status: order.status,
        deliveryDueDate: order.deliveryDueDate,
        note: order.note,
        deliverySubmitted,
        hasActiveDispute,
        ...mapOwnershipToDTO(order),
        ...mapSoftDeleteToDTO(order),
        ...mapLifeCycleToDTO(order),
    };
}

export function ordersToDTO(
    orders: IOrder[],
    submittedDeliveryOrderIds?: Set<string>,
    activeDisputeOrderIds?: Set<string>,
): Order[] {
    return orders.map((order) =>
        orderToDTO(
            order,
            submittedDeliveryOrderIds?.has(order._id.toString()) ?? false,
            activeDisputeOrderIds?.has(order._id.toString()) ?? false,
        ),
    );
}

/** Storefront account view of an order; reads the image from a `listing` populated with `mainImage`. */
export function orderToBuyerDTO(
    order: IOrder,
    deliverySubmitted: boolean,
    hasActiveDispute: boolean,
    reviewed: boolean,
): BuyerServiceOrder {
    return {
        ...orderToDTO(order, deliverySubmitted, hasActiveDispute),
        listingImage: nestedEntityToRef(order.listing?.mainImage)?.toString(),
        reviewed,
    };
}
