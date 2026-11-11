import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";
import {IListingAddOn} from "@marketplaceModule/database/schemas/listingAddOn/listingAddOn";

export function listingAddOnToSelect(addon: IListingAddOn): ApiSelectDatum {
    const symbol = (addon as any).price?.currency?.symbol ?? "";
    const amount = addon.price?.amount ?? 0;
    const label = [addon.name, symbol ? `${symbol}${amount}` : `${amount}`].filter(Boolean).join(" - ") || addon.name;

    return {
        value: addon._id.toString(),
        label,
    };
}

export function listingAddOnsToSelect(addons: IListingAddOn[]): ApiSelectDatum[] {
    return addons.map(listingAddOnToSelect);
}
