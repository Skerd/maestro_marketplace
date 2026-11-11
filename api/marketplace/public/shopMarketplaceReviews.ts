import {Router} from "express";
import {ObjectId} from "mongodb";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import authMW from "@coreModule/utilities/middlewares/authMW";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import {validateFormZod} from "@coreModule/utilities/middlewares/validateFormZod";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {orderService} from "@marketplaceModule/database/schemas/order/order.service";
import {reviewService} from "@marketplaceModule/database/schemas/review/review.service";
import {resolveStorefrontContext, inStorefrontCatalog} from "@coreModule/utilities/marketing/portalStorefront";
import {toShopMarketplaceReview} from "@marketplaceModule/utilities/mappers/shopMarketplace/shopMarketplace.mapper";
import {
    shopMarketplaceReviewsFormSchema,
    type ShopMarketplaceReviewsFormType,
} from "armonia/src/modules/marketplace/api/marketplace/public/shopMarketplace/shopMarketplace.form.validator";
import type {ShopMarketplaceReviewsResponse} from "armonia/src/modules/marketplace/api/marketplace/public/shopMarketplace/shopMarketplace.types";

export const basePath = "/api/marketplace/shopMarketplaceReviews";
export const router = Router();

/**
 * Reviews of one active listing, or of every order a provider with an active
 * listing delivered (listing and task-request orders alike).
 */
router.post(
    "",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 120}),
    validateFormZod(shopMarketplaceReviewsFormSchema),
    asyncHandler(async (params: any & ShopMarketplaceReviewsFormType): Promise<ShopMarketplaceReviewsResponse> => {
        const {languageCode, origin, listingId, providerId, page = 1, limit = 10} = params;

        const ctx = await resolveStorefrontContext(origin, languageCode);
        return inStorefrontCatalog(ctx, async () => {
            const active: Record<string, unknown> = {status: "active"};
            if (ctx.mode === "tenant") active.company = ctx.company._id;

            let filter: Record<string, unknown>;
            if (listingId) {
                const listing = await listingService.findOne({...active, _id: new ObjectId(listingId)}, {withDeleted: false}, undefined, "_id company");
                if (!listing) {
                    throw apiValidationException("listing_not_found", null, null, languageCode);
                }
                const sellerCompanyId = (listing as any).company;
                filter = {company: sellerCompanyId, listing: new ObjectId(listingId)};
            } else {
                const provider = new ObjectId(providerId);
                const listing = await listingService.findOne({...active, provider}, {withDeleted: false}, undefined, "_id company");
                if (!listing) {
                    throw apiValidationException("provider_not_found", null, null, languageCode);
                }
                const sellerCompanyId = (listing as any).company;
                const orders = await orderService.find({company: sellerCompanyId, provider}, {withDeleted: false}, undefined, "_id");
                filter = {company: sellerCompanyId, order: {$in: orders.map((order) => order._id)}};
            }

            const [reviews, total] = await Promise.all([
                reviewService.find(
                    filter,
                    {withDeleted: false},
                    [{path: "reviewer", select: "name surname"}, {path: "listing", select: "title"}],
                    "rating comment reviewer listing createdAt",
                    {createdAt: -1},
                    limit,
                    (page - 1) * limit,
                ),
                reviewService.count(filter, {withDeleted: false}),
            ]);

            return {data: reviews.map(toShopMarketplaceReview), total};

        });
    }),
);
