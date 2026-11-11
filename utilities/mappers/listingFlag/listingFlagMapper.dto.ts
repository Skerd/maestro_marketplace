import type {IListingFlag} from "@marketplaceModule/database/schemas/listingFlag/listingFlag";
import type {ListingFlag} from "armonia/src/modules/marketplace/api/marketplace/private/listingFlag/listingFlag.dto";
import type {SimpleUser} from "armonia/src/modules/core/dto/user.dto";
import type {ListingSimple} from "armonia/src/modules/marketplace/dto/listing.dto";
import {SimpleUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {ListingSimpleSnippet} from "@marketplaceModule/database/schemas/listing/listing.snippets";
import {mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {mapOwnershipToDTO, mapSoftDeleteToDTO, mapLifeCycleToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";

export function listingFlagToDTO(f: IListingFlag): ListingFlag {
    return {
        _id: f._id.toString(),
        listing: mapSnippet<ListingSimple>()(f.listing, ListingSimpleSnippet),
        user: mapSnippet<SimpleUser>()(f.user, SimpleUserSnippet),
        reason: f.reason,
        comment: f.comment,
        status: f.status || "pending",
        resolution: f.resolution,
        ...mapOwnershipToDTO(f),
        ...mapSoftDeleteToDTO(f),
        ...mapLifeCycleToDTO(f),
    };
}

export function listingFlagsToDTO(flags: IListingFlag[]): ListingFlag[] {
    return flags.map(listingFlagToDTO);
}
