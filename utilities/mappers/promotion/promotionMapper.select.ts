import {IPromotion} from "@marketplaceModule/database/schemas/promotion/promotion";
import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";

export function promotionToSelect(promotion: IPromotion): ApiSelectDatum {
    const listingTitle = promotion.listing?.title ?? promotion._id.toString();
    return {
        value: promotion._id.toString(),
        label: `${promotion.type}: ${listingTitle}`,
    };
}

export function promotionsToSelect(promotions: IPromotion[]): ApiSelectDatum[] {
    return promotions.map(promotionToSelect);
}
