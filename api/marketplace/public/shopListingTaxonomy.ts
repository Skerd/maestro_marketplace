import {findPlatformCompanyId} from "@coreModule/utilities/security/platformAccess";
import {Router} from "express";
import {ObjectId} from "mongodb";
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
import {publicListingClause} from "@marketplaceModule/utilities/shop/shopMarketplaceFilter";
import {marketplaceCategoryClause} from "@marketplaceModule/utilities/services/marketplacePlatform";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {validateFormZod} from "@coreModule/utilities/middlewares/validateFormZod";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {listDisplayName} from "@coreModule/utilities/helpers/listNames";
import {listingCategoryDescendants} from "@marketplaceModule/utilities/shop/shopMarketplaceFilter";
import {shopListingTaxonomyFormSchema} from "armonia/src/modules/marketplace/api/marketplace/public/shopMarketplace/shopMarketplace.form.validator";
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

const CATEGORY_SELECT = "name names slug delivery parentListingCategory order";

/** The categories with every category above them, one query per level (the tree is 4 deep). */
async function withAncestors(ids: ObjectId[], clause: Record<string, unknown>): Promise<any[]> {
    const rows = new Map<string, any>();
    let wanted = ids;
    while (wanted.length > 0) {
        const found: any[] = await listingCategoryService.find({...clause, _id: {$in: wanted}}, {withDeleted: false}, undefined, CATEGORY_SELECT);
        for (const row of found) rows.set(String(row._id), row);
        wanted = found.map((row) => nestedEntityToRef(row.parentListingCategory)).filter((id): id is ObjectId => !!id && !rows.has(String(id)));
    }
    return [...rows.values()];
}

/**
 * Service categories for the Services menu, the filters and the job form, and the places public listings cover for
 * the location filter. The platform tree has thousands of categories (D196), so a page never gets all of them.
 */
router.post(
    "",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 60}),
    validateFormZod(shopListingTaxonomyFormSchema),
    asyncHandler(async (params: any): Promise<ShopListingTaxonomyResponse> => {
        const {languageCode, origin, section} = params;

        const ctx = await resolveStorefrontContext(origin, languageCode);
        // The platform company keeps the public task board (D172, D197): on its own site, like the apex, it offers
        // every provider's work.
        const platformId = ctx.mode === "tenant" ? await findPlatformCompanyId() : undefined;
        const taskBoard = ctx.mode === "tenant" && !!platformId?.equals(ctx.company._id);
        const view = <T>(read: () => Promise<T>): Promise<T> => taskBoard
            ? asCrossTenant("the task board offers every provider's categories (D172)", read)
            : inStorefrontCatalog(ctx, read);
        return view(async () => {
            const activeMatch: Record<string, unknown> = {...publicListingClause(), deletedAt: null};
            const companyFilter = ctx.mode === "tenant" && !taskBoard
                ? {company: ctx.company._id}
                : await liveProviderCompanyClause();
            Object.assign(activeMatch, companyFilter);
            // The platform's tree (D196); a company's own site keeps only the categories its listings use (below).
            const categoryFilter = await marketplaceCategoryClause();

            const [categoryCounts, placeRows] = await Promise.all([
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
            const usedIds = categoryCounts.map((row) => nestedEntityToRef(row._id)).filter((id): id is ObjectId => !!id);
            const used = await withAncestors(usedIds, categoryFilter);
            // The apex and the task board offer every section (anyone may post a job in any); a company's own site only its own.
            const ownSite = ctx.mode === "tenant" && !taskBoard;
            const sections = ownSite ? [] : await listingCategoryService.find({...categoryFilter, parentListingCategory: null}, {withDeleted: false}, undefined, CATEGORY_SELECT);
            const byId = new Map<string, any>([...sections, ...used].map((row) => [String(row._id), row]));
            if (section) {
                const sectionId = new ObjectId(section);
                const branchIds = [sectionId, ...await listingCategoryDescendants([sectionId])];
                const branch = await listingCategoryService.find({...categoryFilter, _id: {$in: branchIds}}, {withDeleted: false}, undefined, CATEGORY_SELECT);
                const usedHere = new Set(used.map((row) => String(row._id)));
                for (const row of branch) if (!ownSite || usedHere.has(String(row._id))) byId.set(String(row._id), row);
            }
            const shown = [...byId.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || listDisplayName(a).localeCompare(listDisplayName(b)));

            return {
                data: {
                    categories: shown.map((category: any) => ({
                        _id: category._id.toString(),
                        name: listDisplayName(category),
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
