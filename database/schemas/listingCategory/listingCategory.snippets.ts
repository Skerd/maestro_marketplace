import type {ListingCategorySimple} from "armonia/src/modules/marketplace/dto/listingCategory.dto";
import type {IListingCategory} from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import {defineSnippet} from "@coreModule/database/utilities/snippet";

export const ListingCategorySimpleSnippet = defineSnippet<IListingCategory, ListingCategorySimple>()({
    keys: {
        _id: {},
        name: {},
        slug: {},
    },
});
