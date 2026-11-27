import {ObjectId} from "mongodb";
import {escapeRegex} from "@coreModule/utilities/helpers";
import {listingCategoryService} from "@marketplaceModule/database/schemas/listingCategory/listingCategory.service";
import {marketplaceCategoryClause} from "@marketplaceModule/utilities/services/marketplaceOperator";
import {promotionService} from "@marketplaceModule/database/schemas/promotion/promotion.service";
import type {CrudOptions} from "@coreModule/database/services/baseCrudService";
import type {ShopPromotionMap} from "@marketplaceModule/utilities/mappers/shopMarketplace/shopMarketplace.mapper";
import type {ShopListingsFormType} from "armonia/src/modules/marketplace/api/marketplace/public/shopMarketplace/shopMarketplace.form.validator";
import {liveProviderCompanyClause} from "./marketplaceSellers";
import {notHiddenByPlatform} from "@coreModule/database/plugins/platformHiddenPlugin";
import type {ShopListingSort} from "armonia/src/modules/marketplace/api/marketplace/public/shopMarketplace/shopMarketplace.form.validator";

/** Mongo sort of each storefront listing order ("recommended" is newest after the promoted listings). */
export const SHOP_LISTING_SORT_SPECS: Record<Exclude<ShopListingSort, "recommended">, Record<string, 1 | -1>> = {
    newest: {createdAt: -1},
    priceAsc: {price: 1, createdAt: -1},
    priceDesc: {price: -1, createdAt: -1},
    rating: {avgRating: -1, reviewCount: -1, createdAt: -1},
};

/** A listing the public may see: active, and not hidden by the platform after a report (D191). */
export function publicListingClause(): Record<string, unknown> {
    return {status: "active", ...notHiddenByPlatform()};
}

/** The ids of every category below `rootIds` in the shared tree (D196), one query per level (the tree is 4 deep). */
export async function listingCategoryDescendants(rootIds: ObjectId[]): Promise<ObjectId[]> {
    const clause = await marketplaceCategoryClause();
    const found: ObjectId[] = [];
    let frontier = rootIds;
    while (frontier.length > 0) {
        const children = await listingCategoryService.find({...clause, parentListingCategory: {$in: frontier}}, {withDeleted: false}, undefined, "_id");
        frontier = children.map((child) => child._id);
        found.push(...frontier);
    }
    return found;
}

/** A category of the shared tree matched by `match`, and every category below it; null when none matches. */
async function categoryScope(match: Record<string, unknown>): Promise<ObjectId[] | null> {
    const root = await listingCategoryService.findOne({...await marketplaceCategoryClause(), ...match}, {withDeleted: false}, undefined, "_id");
    if (!root) return null;
    return [root._id, ...await listingCategoryDescendants([root._id])];
}

/** A category slug of the shared tree (D196) and every category below it; null when the slug matches nothing. */
export function listingCategoryScope(slug: string): Promise<ObjectId[] | null> {
    return categoryScope({slug});
}

/** A category of the shared tree (D196) by id and every category below it; null when the id matches nothing. */
export function listingCategoryScopeById(id: string): Promise<ObjectId[] | null> {
    return ObjectId.isValid(id) ? categoryScope({_id: new ObjectId(id)}) : Promise.resolve(null);
}

/**
 * Storefront listing filter: public listings (`publicListingClause`) narrowed by the browse form.
 * When `companyId` is omitted (platform), all live companies' active listings are included.
 * Null when the category slug is unknown or ambiguous (an empty page).
 */
export async function buildShopListingFilter(
    companyId: ObjectId | undefined,
    form: ShopListingsFormType,
): Promise<Record<string, unknown> | null> {
    const filter: Record<string, unknown> = publicListingClause();
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
        const scope = await listingCategoryScope(form.categorySlug);
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
