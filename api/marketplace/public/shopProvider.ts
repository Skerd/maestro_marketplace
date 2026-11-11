import {Router} from "express";
import {ObjectId} from "mongodb";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import authMW from "@coreModule/utilities/middlewares/authMW";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import {validateFormZod} from "@coreModule/utilities/middlewares/validateFormZod";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {userService} from "@coreModule/database/schemas/user/user.service";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {providerProfileService} from "@marketplaceModule/database/schemas/providerProfile/providerProfile.service";
import {resolveStorefrontContext, inStorefrontCatalog} from "@coreModule/utilities/marketing/portalStorefront";
import {shopPromotionMap} from "@marketplaceModule/utilities/shop/shopMarketplaceFilter";
import {loadProviderProfileMetrics} from "@marketplaceModule/utilities/mappers/providerProfile/providerProfileMetrics";
import {loadProviderAvailability} from "@marketplaceModule/utilities/services/providerAvailability";
import {
    SHOP_LISTING_CARD_FIELDS,
    SHOP_LISTING_CARD_POPULATE,
    toShopListingCard,
    toShopProviderProfile,
} from "@marketplaceModule/utilities/mappers/shopMarketplace/shopMarketplace.mapper";
import {
    shopMarketplaceIdFormSchema,
    type ShopMarketplaceIdFormType,
} from "armonia/src/modules/marketplace/api/marketplace/public/shopMarketplace/shopMarketplace.form.validator";
import type {ShopProviderResponse} from "armonia/src/modules/marketplace/api/marketplace/public/shopMarketplace/shopMarketplace.types";

export const basePath = "/api/marketplace/shopProvider";
export const router = Router();

const LISTINGS_LIMIT = 48;

/** A provider's public page; only users offering at least one active listing in the shop have one. */
router.post(
    "",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 120}),
    validateFormZod(shopMarketplaceIdFormSchema),
    asyncHandler(async (params: any & ShopMarketplaceIdFormType): Promise<ShopProviderResponse> => {
        const {languageCode, origin, logger, id} = params;
        const opts = {logger, languageCode};

        const ctx = await resolveStorefrontContext(origin, languageCode);
        return inStorefrontCatalog(ctx, async () => {
            const providerId = new ObjectId(id);
            const listingFilter: Record<string, unknown> = {status: "active", provider: providerId};
            if (ctx.mode === "tenant") listingFilter.company = ctx.company._id;

            const listings = await listingService.find(listingFilter, {withDeleted: false}, SHOP_LISTING_CARD_POPULATE, SHOP_LISTING_CARD_FIELDS, {createdAt: -1}, LISTINGS_LIMIT);
            if (listings.length === 0) {
                throw apiValidationException("provider_not_found", null, null, languageCode);
            }

            const sellerCompanyId = (listings[0] as any).company?._id ?? (listings[0] as any).company;
            const userFilter: Record<string, unknown> = {_id: providerId};
            if (ctx.mode === "tenant") userFilter.companies = ctx.company._id;
            const user = await userService.findOne(userFilter, {}, undefined, "name surname createdAt");
            if (!user) {
                throw apiValidationException("provider_not_found", null, null, languageCode);
            }

            const [profile, metrics, availability, promotions] = await Promise.all([
                providerProfileService.findOne({user: providerId, company: sellerCompanyId}, {withDeleted: false}, undefined, "bio skills portfolio"),
                loadProviderProfileMetrics(providerId, sellerCompanyId, opts),
                loadProviderAvailability(providerId, sellerCompanyId, opts),
                shopPromotionMap(ctx.mode === "tenant" ? ctx.company._id : sellerCompanyId, opts),
            ]);

            return {
                data: {
                    provider: toShopProviderProfile(user, profile, availability, metrics),
                    listings: listings.map((listing) => toShopListingCard(listing, promotions)),
                },
            };

        });
    }),
);
