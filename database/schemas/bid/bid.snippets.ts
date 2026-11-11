import type {BidSimple} from "armonia/src/modules/marketplace/dto/bid.dto";
import type {IBid} from "@marketplaceModule/database/schemas/bid/bid";
import {defineSnippet} from "@coreModule/database/utilities/snippet";

export const BidSimpleSnippet = defineSnippet<IBid, BidSimple>()({
    keys: {
        _id: {},
        name: {},
        amount: {},
        status: {},
    },
});
