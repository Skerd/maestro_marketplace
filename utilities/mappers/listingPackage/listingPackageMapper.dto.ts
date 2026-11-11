import type {IListingPackage} from "@marketplaceModule/database/schemas/listingPackage/listingPackage";
import type {ListingPackage} from "armonia/src/modules/marketplace/api/marketplace/private/listingPackage/listingPackage.dto";
import type {CurrencySimple} from "armonia/src/modules/core/dto/currency.dto";
import type {SimpleUser} from "armonia/src/modules/core/dto/user.dto";
import type {ListingSimple} from "armonia/src/modules/marketplace/dto/listing.dto";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {SimpleUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {ListingSimpleSnippet} from "@marketplaceModule/database/schemas/listing/listing.snippets";
import {mapOwnershipToDTO, mapSoftDeleteToDTO, mapLifeCycleToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";
import {mapSnippet} from "@coreModule/utilities/mappers/common.mapper";

export function listingPackageToDTO(pkg: IListingPackage): ListingPackage {
    return {
        _id: pkg._id.toString(),
        listing: mapSnippet<ListingSimple>()(pkg.listing, ListingSimpleSnippet),
        provider: mapSnippet<SimpleUser>()(pkg.provider, SimpleUserSnippet),
        name: pkg.name,
        description: pkg.description,
        price: {
            amount: pkg.price?.amount,
            currency: mapSnippet<CurrencySimple>()(pkg.price?.currency, CurrencySimpleSnippet),
        },
        deliveryDays: pkg.deliveryDays,
        order: pkg.order ?? 0,
        ...mapOwnershipToDTO(pkg),
        ...mapSoftDeleteToDTO(pkg),
        ...mapLifeCycleToDTO(pkg),
    };
}

export function listingPackagesToDTOArray(packages: IListingPackage[]): ListingPackage[] {
    return packages.map(listingPackageToDTO);
}
