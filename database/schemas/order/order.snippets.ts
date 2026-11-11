import type {OrderSimple, OrderWithTaskOrListing} from "armonia/src/modules/marketplace/dto/order.dto";
import type {IOrder} from "@marketplaceModule/database/schemas/order/order";
import {defineSnippet} from "@coreModule/database/utilities/snippet";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {SimpleUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {ListingSimpleSnippet} from "@marketplaceModule/database/schemas/listing/listing.snippets";
import {TaskRequestSimpleSnippet} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.snippets";

export const OrderSimpleSnippet = defineSnippet<IOrder, OrderSimple>()({
    keys: {
        _id: {},
        name: {},
        status: {},
        amount: {},
        listing: ListingSimpleSnippet,
        taskRequest: TaskRequestSimpleSnippet,
        customer: SimpleUserSnippet,
    },
});

export const OrderWithTaskOrListingSnippet = defineSnippet<IOrder, OrderWithTaskOrListing>()({
    keys: {
        _id: {},
        name: {},
        status: {},
        amount: {},
        currency: CurrencySimpleSnippet,
        taskRequest: TaskRequestSimpleSnippet,
        listing: ListingSimpleSnippet,
    },
});
