import type {IListingFlag} from "@marketplaceModule/database/schemas/listingFlag/listingFlag";
import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";

export function listingFlagToSelect(flag: IListingFlag): ApiSelectDatum {
    const listingTitle = (flag.listing as {title?: string} | undefined)?.title;
    const label = listingTitle ? `${flag.reason} — ${listingTitle}` : flag.reason;
    return {
        value: flag._id.toString(),
        label,
    };
}

export function listingFlagsToSelect(flags: IListingFlag[]): ApiSelectDatum[] {
    return flags.map(listingFlagToSelect);
}
