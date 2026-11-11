import {Router} from "express";
import {ObjectId} from "mongodb";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import authMW from "@coreModule/utilities/middlewares/authMW";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import {validateFormZod} from "@coreModule/utilities/middlewares/validateFormZod";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {resolveStorefrontContext, inStorefrontCatalog} from "@coreModule/utilities/marketing/portalStorefront";
import {buildShopListingFilter, SHOP_LISTING_SORT_SPECS, shopPromotionMap} from "@marketplaceModule/utilities/shop/shopMarketplaceFilter";
import {
    SHOP_LISTING_CARD_FIELDS,
    SHOP_LISTING_CARD_POPULATE,
    toShopListingCard,
} from "@marketplaceModule/utilities/mappers/shopMarketplace/shopMarketplace.mapper";
import {
    shopListingsFormSchema,
    type ShopListingsFormType,
} from "armonia/src/modules/marketplace/api/marketplace/public/shopMarketplace/shopMarketplace.form.validator";
import type {ShopListingsResponse} from "armonia/src/modules/marketplace/api/marketplace/public/shopMarketplace/shopMarketplace.types";

export const basePath = "/api/marketplace/shopListings";
export const router = Router();


function findCards(filter: Record<string, unknown>, sort: Record<string, 1 | -1>, skip: number, limit: number) {
    return listingService.find(filter, {withDeleted: false}, SHOP_LISTING_CARD_POPULATE, SHOP_LISTING_CARD_FIELDS, sort, limit, skip);
}

router.post(
    "",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 120}),
    validateFormZod(shopListingsFormSchema),
    asyncHandler(async (params: any & ShopListingsFormType): Promise<ShopListingsResponse> => {
        const {languageCode, origin, logger, sort = "recommended", page = 1, limit = 24} = params;

        const ctx = await resolveStorefrontContext(origin, languageCode);
        return inStorefrontCatalog(ctx, async () => {
            const companyId = ctx.mode === "tenant" ? ctx.company._id : undefined;
            const filter = await buildShopListingFilter(companyId, params);
            if (!filter) return {data: [], total: 0, page, limit};

            const promotions = await shopPromotionMap(companyId, {logger, languageCode});
            const skip = (page - 1) * limit;

            if (sort !== "recommended" || promotions.size === 0) {
                const [listings, total] = await Promise.all([
                    findCards(filter, SHOP_LISTING_SORT_SPECS[sort === "recommended" ? "newest" : sort], skip, limit),
                    listingService.count(filter, {withDeleted: false}),
                ]);
                return {data: listings.map((listing) => toShopListingCard(listing, promotions)), total, page, limit};
            }

            // Recommended: listings with a running promotion first, then the rest, newest first in each band
            const promotedIds = [...promotions.keys()].map((id) => new ObjectId(id));
            const promotedFilter = {...filter, _id: {$in: promotedIds}};
            const otherFilter = {...filter, _id: {$nin: promotedIds}};
            const [promotedTotal, otherTotal] = await Promise.all([
                listingService.count(promotedFilter, {withDeleted: false}),
                listingService.count(otherFilter, {withDeleted: false}),
            ]);

            const promoted = skip < promotedTotal ? await findCards(promotedFilter, SHOP_LISTING_SORT_SPECS.newest, skip, limit) : [];
            const remaining = limit - promoted.length;
            const others = remaining > 0
                ? await findCards(otherFilter, SHOP_LISTING_SORT_SPECS.newest, Math.max(0, skip - promotedTotal), remaining)
                : [];

            return {
                data: [...promoted, ...others].map((listing) => toShopListingCard(listing, promotions)),
                total: promotedTotal + otherTotal,
                page,
                limit,
            };

        });
    }),
);
