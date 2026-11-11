import type {ListingPackageSimple} from "armonia/src/modules/marketplace/dto/listingPackage.dto";
import type {IListingPackage} from "@marketplaceModule/database/schemas/listingPackage/listingPackage";
import {defineSnippet} from "@coreModule/database/utilities/snippet";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";

export const ListingPackageSimpleSnippet = defineSnippet<IListingPackage, ListingPackageSimple>()({
    keys: {
        _id: {},
        name: {},
        description: {},
        order: {},
        deliveryDays: {},
        price: {
            keys: {
                amount: {},
                currency: CurrencySimpleSnippet,
            },
        },
    },
});
