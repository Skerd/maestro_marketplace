import type {PromotionSimple} from "armonia/src/modules/marketplace/dto/promotion.dto";
import type {IPromotion} from "@marketplaceModule/database/schemas/promotion/promotion";
import {defineSnippet} from "@coreModule/database/utilities/snippet";

export const PromotionSimpleSnippet = defineSnippet<IPromotion, PromotionSimple>()({
    keys: {
        _id: {},
        name: {},
        type: {},
        startAt: {},
        endAt: {},
    },
});
