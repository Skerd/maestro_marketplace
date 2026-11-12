import {Router} from "express";
import type {Model} from "mongoose";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import authMW from "@coreModule/utilities/middlewares/authMW";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import Country from "@coreModule/database/schemas/country/country";
import State from "@coreModule/database/schemas/state/state";
import City from "@coreModule/database/schemas/city/city";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {listingCategoryService} from "@marketplaceModule/database/schemas/listingCategory/listingCategory.service";
import {resolveStorefrontContext, inStorefrontCatalog} from "@coreModule/utilities/marketing/portalStorefront";
import {liveProviderCompanyClause} from "@marketplaceModule/utilities/shop/marketplaceSellers";
import {marketplaceCategoryClause} from "@marketplaceModule/utilities/services/marketplaceOperator";
import type {
    ShopListingLocation,
    ShopListingTaxonomyResponse,
    ShopPlace,
} from "armonia/src/modules/marketplace/api/marketplace/public/shopMarketplace/shopMarketplace.types";

export const basePath = "/api/marketplace/shopListingTaxonomy";
export const router = Router();

type PlaceKey = {country?: unknown; state?: unknown; city?: unknown};

async function placeNames(model: Model<any>, ids: unknown[]): Promise<Map<string, ShopPlace>> {
    if (ids.length === 0) return new Map();
    const docs: any[] = await model.find({_id: {$in: ids}}).select("name").lean();
    return new Map(docs.map((doc) => [doc._id.toString(), {_id: doc._id.toString(), name: doc.name ?? ""}]));
}

/** Listing categories for the Services menu, and the places active listings cover for the location filter. */
router.post(
    "",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 60}),
    asyncHandler(async (params: any): Promise<ShopListingTaxonomyResponse> => {
        const {languageCode, origin} = params;

        const ctx = await resolveStorefrontContext(origin, languageCode);
        return inStorefrontCatalog(ctx, async () => {
            const activeMatch: Record<string, unknown> = {status: "active", deletedAt: null};
            const companyFilter = ctx.mode === "tenant"
                ? {company: ctx.company._id}
                : await liveProviderCompanyClause();
            Object.assign(activeMatch, companyFilter);
            // One shared tree (D144); a company's own site keeps only the branches its listings use (below).
            const categoryFilter = await marketplaceCategoryClause();

            const [categories, categoryCounts, placeRows] = await Promise.all([
                listingCategoryService.find(categoryFilter, {withDeleted: false}, undefined, "name slug delivery parentListingCategory order", {order: 1, name: 1}),
                listingService.aggregate([
                    {$match: activeMatch},
                    {$group: {_id: "$category", count: {$sum: 1}}},
                ]),
                listingService.aggregate([
                    {$match: {...activeMatch, address: {$exists: true}}},
                    {$group: {_id: {country: "$address.country", state: "$address.state", city: "$address.city"}}},
                ]),
            ]);

            const keys = placeRows.map((row) => row._id).filter((key) => key.country || key.state || key.city);
            const [countries, states, cities] = await Promise.all([
                placeNames(Country, keys.map((key) => key.country).filter(Boolean)),
                placeNames(State, keys.map((key) => key.state).filter(Boolean)),
                placeNames(City, keys.map((key) => key.city).filter(Boolean)),
            ]);
            const locations: ShopListingLocation[] = keys.map((key) => ({
                country: key.country ? countries.get(String(key.country)) : undefined,
                state: key.state ? states.get(String(key.state)) : undefined,
                city: key.city ? cities.get(String(key.city)) : undefined,
            }));

            const counts = new Map(categoryCounts.map((row) => [String(row._id), row.count]));
            const parentOf = new Map(categories.map((category) => [category._id.toString(), category.parentListingCategory?.toString()]));
            const used = new Set<string>();
            for (const id of counts.keys()) {
                for (let current: string | undefined = id; current && !used.has(current); current = parentOf.get(current)) used.add(current);
            }
            const shown = ctx.mode === "tenant" ? categories.filter((category) => used.has(category._id.toString())) : categories;

            return {
                data: {
                    categories: shown.map((category: any) => ({
                        _id: category._id.toString(),
                        name: category.name ?? "",
                        slug: category.slug ?? "",
                        parent: category.parentListingCategory ? category.parentListingCategory.toString() : undefined,
                        order: category.order,
                        delivery: category.delivery ?? "remote",
                        listingCount: counts.get(category._id.toString()) ?? 0,
                    })),
                    locations,
                    listingCount: categoryCounts.reduce((sum, row) => sum + row.count, 0),
                },
            };

        });
    }),
);
