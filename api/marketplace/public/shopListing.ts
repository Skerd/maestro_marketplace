import {Router} from "express";
import {ObjectId} from "mongodb";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import authMW from "@coreModule/utilities/middlewares/authMW";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import {validateFormZod} from "@coreModule/utilities/middlewares/validateFormZod";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {userService} from "@coreModule/database/schemas/user/user.service";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {listingAddOnService} from "@marketplaceModule/database/schemas/listingAddOn/listingAddOn.service";
import {listingPackageService} from "@marketplaceModule/database/schemas/listingPackage/listingPackage.service";
import {providerProfileService} from "@marketplaceModule/database/schemas/providerProfile/providerProfile.service";
import {resolveStorefrontContext, inStorefrontCatalog} from "@coreModule/utilities/marketing/portalStorefront";
import {shopPromotionMap} from "@marketplaceModule/utilities/shop/shopMarketplaceFilter";
import {loadProviderProfileMetrics} from "@marketplaceModule/utilities/mappers/providerProfile/providerProfileMetrics";
import {loadProviderAvailability} from "@marketplaceModule/utilities/services/providerAvailability";
import {
    SHOP_LISTING_CARD_FIELDS,
    SHOP_LISTING_CARD_POPULATE,
    toShopListingCard,
    toShopListingDetail,
    toShopProviderProfile,
} from "@marketplaceModule/utilities/mappers/shopMarketplace/shopMarketplace.mapper";
import {
    shopMarketplaceIdFormSchema,
    type ShopMarketplaceIdFormType,
} from "armonia/src/modules/marketplace/api/marketplace/public/shopMarketplace/shopMarketplace.form.validator";
import type {ShopListingResponse} from "armonia/src/modules/marketplace/api/marketplace/public/shopMarketplace/shopMarketplace.types";

export const basePath = "/api/marketplace/shopListing";
export const router = Router();

const RELATED_LIMIT = 8;
const CURRENCY_FIELDS = "symbol abbreviation decimalPlaces";

router.post(
    "",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 120}),
    validateFormZod(shopMarketplaceIdFormSchema),
    asyncHandler(async (params: any & ShopMarketplaceIdFormType): Promise<ShopListingResponse> => {
        const {languageCode, origin, logger, id} = params;
        const opts = {logger, languageCode};

        const ctx = await resolveStorefrontContext(origin, languageCode);
        return inStorefrontCatalog(ctx, async () => {
            const listingFilter: Record<string, unknown> = {_id: new ObjectId(id), status: "active"};
            if (ctx.mode === "tenant") listingFilter.company = ctx.company._id;

            const listing: any = await listingService.findOne(listingFilter, {withDeleted: false}, SHOP_LISTING_CARD_POPULATE);
            if (!listing) {
                throw apiValidationException("listing_not_found", null, null, languageCode);
            }

            const sellerCompanyId = ctx.mode === "tenant"
                ? ctx.company._id
                : (listing.company?._id ?? listing.company);
            const providerId = listing.provider._id ?? listing.provider;
            const [packages, addOns, user, profile, metrics, availability, related, promotions] = await Promise.all([
                listingPackageService.find(
                    {listing: listing._id, company: sellerCompanyId},
                    {withDeleted: false},
                    {path: "price.currency", select: CURRENCY_FIELDS},
                    "name description price deliveryDays order",
                    {order: 1, "price.amount": 1},
                ),
                listingAddOnService.find(
                    {listing: listing._id, company: sellerCompanyId},
                    {withDeleted: false},
                    {path: "price.currency", select: CURRENCY_FIELDS},
                    "name price deliveryDays",
                    {"price.amount": 1},
                ),
                userService.findById(providerId, {}, undefined, "name surname createdAt"),
                providerProfileService.findOne({user: providerId, company: sellerCompanyId}, {withDeleted: false}, undefined, "bio skills portfolio"),
                loadProviderProfileMetrics(providerId, sellerCompanyId, opts),
                loadProviderAvailability(providerId, sellerCompanyId, opts),
                listing.category
                    ? listingService.find({
                        company: sellerCompanyId,
                        status: "active",
                        category: listing.category._id,
                        _id: {$ne: listing._id},
                    }, {withDeleted: false}, SHOP_LISTING_CARD_POPULATE, SHOP_LISTING_CARD_FIELDS, {avgRating: -1, createdAt: -1}, RELATED_LIMIT)
                    : [],
                shopPromotionMap(sellerCompanyId, opts),
            ]);

            const provider = user ? toShopProviderProfile(user, profile, availability, metrics) : undefined;
            return {
                data: toShopListingDetail(
                    listing,
                    packages,
                    addOns,
                    provider,
                    related.map((item) => toShopListingCard(item, promotions)),
                    promotions,
                ),
            };

        });
    }),
);
