import type {IListingCategory} from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import type {ListingCategory} from "armonia/src/modules/marketplace/api/marketplace/private/listingCategory/listingCategory.dto";
import type {ListingCategorySimple, ListingCategorySimpleSource} from "armonia/src/modules/marketplace/dto/listingCategory.dto";
import {ListingCategorySimpleSnippet} from "@marketplaceModule/database/schemas/listingCategory/listingCategory.snippets";
import {mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {listDisplayName} from "@coreModule/utilities/helpers/listNames";
import {
    mapLifeCycleToDTO,
    mapOwnershipToDTO,
    mapRequestableToDTO,
    mapSoftDeleteToDTO,
} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";

export function listingCategoryToDTO(cat: IListingCategory): ListingCategory {
    return {
        _id: cat._id.toString(),
        name: listDisplayName(cat),
        slug: cat.slug,
        delivery: cat.delivery ?? "remote",
        parentListingCategory: listingCategorySimpleToDTO(cat.parentListingCategory),
        order: cat.order,
        ...mapSoftDeleteToDTO(cat),
        ...mapOwnershipToDTO(cat),
        ...mapLifeCycleToDTO(cat),
        ...mapRequestableToDTO(cat),
    };
}

/** The single read the edit form loads: also every language's name, which the platform edits (D196). */
export function listingCategoryEditToDTO(cat: IListingCategory): ListingCategory {
    const names = cat.names;
    return {...listingCategoryToDTO(cat), ...(names ? {names: {en: names.en, sq: names.sq, de: names.de, fr: names.fr, it: names.it}} : {})};
}

export function listingCategoriesToDTO(categories: IListingCategory[]): ListingCategory[] {
    return categories.map(listingCategoryToDTO);
}

/** A populated category reference, named in the reader's language (D196); undefined for an unpopulated id. */
export function listingCategorySimpleToDTO(category: unknown): ListingCategorySimple | undefined {
    if (!category || typeof category !== "object" || !("_id" in category)) return undefined;
    const source = mapSnippet<ListingCategorySimpleSource>()(category, ListingCategorySimpleSnippet);
    if (!source) return undefined;
    return {_id: source._id, name: listDisplayName(source), slug: source.slug, ...(source.delivery ? {delivery: source.delivery} : {})};
}
