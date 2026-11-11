import type {ListingSimple} from "armonia/src/modules/marketplace/dto/listing.dto";
import type {IListing} from "@marketplaceModule/database/schemas/listing/listing";
import {defineSnippet} from "@coreModule/database/utilities/snippet";

export const ListingSimpleSnippet = defineSnippet<IListing, ListingSimple>()({
    keys: {
        _id: {},
        name: {},
        title: {},
        status: {},
    },
});
