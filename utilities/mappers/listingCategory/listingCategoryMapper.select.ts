import type {IListingCategory} from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";
import {listDisplayName} from "@coreModule/utilities/helpers/listNames";

/**
 * Picker options in the reader's language (D196). With a populated parent the label names it too ("Plumbing › Leaks
 * & Taps"), since thousands of services share short names ("Installation", "Repair").
 */
export function listingCategoriesToSelect(categories: IListingCategory[]): ApiSelectDatum[] {
    return categories.map((c) => {
        const parent = c.parentListingCategory && typeof c.parentListingCategory === "object" && "name" in c.parentListingCategory
            ? listDisplayName(c.parentListingCategory)
            : "";
        const name = listDisplayName(c);
        return {value: c._id.toString(), label: parent ? `${parent} › ${name}` : name};
    });
}
