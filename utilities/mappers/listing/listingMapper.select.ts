import {IListing} from "@marketplaceModule/database/schemas/listing/listing";
import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";

export function listingToSelect(listing: IListing): ApiSelectDatum {
    const label = [listing.name, listing.title].filter(Boolean).join(" - ") || listing.name || "";
    return {
        value: listing._id.toString(),
        label: label
    };
}

export function listingsToSelect(listings: IListing[]): ApiSelectDatum[] {
    return listings.map(listingToSelect);
}