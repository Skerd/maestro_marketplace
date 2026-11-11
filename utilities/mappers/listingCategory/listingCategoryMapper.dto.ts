import type {IListingCategory} from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import type {ListingCategory} from "armonia/src/modules/marketplace/api/marketplace/private/listingCategory/listingCategory.dto";
import type {ListingCategorySimple} from "armonia/src/modules/marketplace/dto/listingCategory.dto";
import {ListingCategorySimpleSnippet} from "@marketplaceModule/database/schemas/listingCategory/listingCategory.snippets";
import {mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {mapOwnershipToDTO, mapSoftDeleteToDTO, mapLifeCycleToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";

export function listingCategoryToDTO(cat: IListingCategory): ListingCategory {
    return {
        _id: cat._id.toString(),
        name: cat.name,
        slug: cat.slug,
        parentListingCategory: mapSnippet<ListingCategorySimple>()(cat.parentListingCategory, ListingCategorySimpleSnippet),
        order: cat.order,
        ...mapSoftDeleteToDTO(cat),
        ...mapOwnershipToDTO(cat),
        ...mapLifeCycleToDTO(cat),
    };
}

export function listingCategoriesToDTO(categories: IListingCategory[]): ListingCategory[] {
    return categories.map(listingCategoryToDTO);
}
