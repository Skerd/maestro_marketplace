import {ObjectId} from "mongodb";
import {escapeRegex} from "@coreModule/utilities/helpers";
import {listingCategoryService} from "@marketplaceModule/database/schemas/listingCategory/listingCategory.service";
import {promotionService} from "@marketplaceModule/database/schemas/promotion/promotion.service";
import type {CrudOptions} from "@coreModule/database/services/baseCrudService";
import type {ShopPromotionMap} from "@marketplaceModule/utilities/mappers/shopMarketplace/shopMarketplace.mapper";
import type {ShopListingsFormType} from "armonia/src/modules/marketplace/api/marketplace/public/shopMarketplace/shopMarketplace.form.validator";
import {liveProviderCompanyClause} from "./marketplaceSellers";
import type {ShopListingSort} from "armonia/src/modules/marketplace/api/marketplace/public/shopMarketplace/shopMarketplace.form.validator";

/** Mongo sort of each storefront listing order ("recommended" is newest after the promoted listings). */
export const SHOP_LISTING_SORT_SPECS: Record<Exclude<ShopListingSort, "recommended">, Record<string, 1 | -1>> = {
    newest: {createdAt: -1},
    priceAsc: {price: 1, createdAt: -1},
    priceDesc: {price: -1, createdAt: -1},
    rating: {avgRating: -1, reviewCount: -1, createdAt: -1},
};

/** A category slug and every category below it; null when the slug matches nothing or is ambiguous on platform. */
async function listingCategoryScope(
    companyClause: Record<string, unknown>,
    platform: boolean,
    slug: string,
): Promise<ObjectId[] | null> {
    const categories: any[] = await listingCategoryService.find(companyClause, {withDeleted: false}, undefined, "slug parentListingCategory company");
    const roots = categories.filter((category) => category.slug === slug);
    if (roots.length === 0) return null;
    if (platform && roots.length > 1) return null;
    const root = roots[0];

    const scope: ObjectId[] = [root._id];
    for (let i = 0; i < scope.length; i++) {
        const parentId = scope[i].toString();
        for (const category of categories) {
            if (category.parentListingCategory?.toString() === parentId) scope.push(category._id);
        }
    }
    return scope;
}

/**
 * Storefront listing filter: active listings narrowed by the browse form.
 * When `companyId` is omitted (platform), all live companies' active listings are included.
 * Null when the category slug is unknown or ambiguous (an empty page).
 */
export async function buildShopListingFilter(
    companyId: ObjectId | undefined,
    form: ShopListingsFormType,
): Promise<Record<string, unknown> | null> {
    const filter: Record<string, unknown> = {status: "active"};
    const platform = companyId == null;
    const companyClause: Record<string, unknown> = platform
        ? await liveProviderCompanyClause()
        : {company: companyId};
    filter.company = companyClause.company;

    if (form.search?.trim()) {
        const term = escapeRegex(form.search.trim());
        filter.$or = [
            {title: {$regex: term, $options: "i"}},
            {tags: {$regex: term, $options: "i"}},
            {description: {$regex: term, $options: "i"}},
        ];
    }
    if (form.categorySlug) {
        const scope = await listingCategoryScope(companyClause, platform, form.categorySlug);
        if (!scope) return null;
        filter.category = {$in: scope};
    }
    if (form.countryId) filter["address.country"] = new ObjectId(form.countryId);
    if (form.stateId) filter["address.state"] = new ObjectId(form.stateId);
    if (form.cityId) filter["address.city"] = new ObjectId(form.cityId);
    if (form.pricingType) filter.pricingType = form.pricingType;
    if (form.priceMin != null || form.priceMax != null) {
        filter.price = {
            ...(form.priceMin != null && {$gte: form.priceMin}),
            ...(form.priceMax != null && {$lte: form.priceMax}),
        };
    }
    if (form.minRating) {
        filter.avgRating = {$gte: form.minRating};
        filter.reviewCount = {$gt: 0};
    }
    return filter;
}

/** Listings with a promotion running now, keyed by listing id. */
export async function shopPromotionMap(companyId: ObjectId | undefined, opts: CrudOptions): Promise<ShopPromotionMap> {
    if (companyId == null) {
        // Platform: no company-scoped promotion ranking — empty map keeps newest sort.
        return new Map();
    }
    const promotions = await promotionService.findRunning(companyId, opts);
    const map: ShopPromotionMap = new Map();
    for (const promotion of promotions) {
        const listingId = (promotion.listing?._id ?? promotion.listing)?.toString();
        // A sponsored slot outranks a featured one on the same listing
        if (listingId && map.get(listingId) !== "sponsored") map.set(listingId, promotion.type ?? "featured");
    }
    return map;
}
