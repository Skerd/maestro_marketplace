import type {IPromotion} from "@marketplaceModule/database/schemas/promotion/promotion";
import type {ListingSimple} from "armonia/src/modules/marketplace/dto/listing.dto";
import {ListingSimpleSnippet} from "@marketplaceModule/database/schemas/listing/listing.snippets";
import {mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import type {Promotion} from "armonia/src/modules/marketplace/api/marketplace/private/promotion/promotion.dto";
import {mapOwnershipToDTO, mapSoftDeleteToDTO, mapLifeCycleToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";

export function promotionToDTO(promotion: IPromotion): Promotion {
    return {
        _id: promotion._id.toString(),
        name: promotion.name,
        listing: mapSnippet<ListingSimple>()(promotion.listing, ListingSimpleSnippet),
        type: promotion.type,
        lifecycleStatus: promotion.lifecycleStatus,
        stopReason: promotion.stopReason,
        startAt: promotion.startAt,
        endAt: promotion.endAt,
        ...mapOwnershipToDTO(promotion),
        ...mapSoftDeleteToDTO(promotion),
        ...mapLifeCycleToDTO(promotion),
    };
}

export function promotionsToDTOArray(promotions: IPromotion[]): Promotion[] {
    return promotions.map(promotionToDTO);
}