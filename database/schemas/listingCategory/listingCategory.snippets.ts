import type {ListingCategorySimpleSource} from "armonia/src/modules/marketplace/dto/listingCategory.dto";
import type {IListingCategory} from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import {defineSnippet} from "@coreModule/database/utilities/snippet";

/** Reads `names` too, so a reference is named in the reader's language; only `name` is sent (D196). */
export const ListingCategorySimpleSnippet = defineSnippet<IListingCategory, ListingCategorySimpleSource>()({
    keys: {
        _id: {},
        name: {},
        names: {},
        slug: {},
        delivery: {},
    },
});
