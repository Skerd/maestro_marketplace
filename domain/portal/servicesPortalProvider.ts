import type {ObjectId} from "mongodb";
import {registerPortalProvider} from "@coreModule/domain/portal/portalProviderRegistry";
import type {PortalBrowseParams, PortalNewSinceContext} from "@coreModule/domain/portal/portalProvider.types";
import {catalogItems, catalogRating, filterValue, newSinceClause} from "@coreModule/domain/portal/portalCatalog";
import {companyAddressCities} from "@coreModule/utilities/marketing/portalCompanies";
import {publicMediaUrl} from "@coreModule/utilities/media/publicMediaUrl";
import {PORTAL_CURRENCY_SELECT} from "@coreModule/utilities/mappers/portal/portalStorefrontMapper.dto";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {buildShopListingFilter, SHOP_LISTING_SORT_SPECS} from "@marketplaceModule/utilities/shop/shopMarketplaceFilter";
import {marketplacePortalCompanyIds} from "@marketplaceModule/utilities/shop/marketplaceSellers";

type CurrencyRef = {abbreviation?: string};

/**
 * Active service listings, with the marketplace's own category filter (`f.category`); `narrowing` keeps only the
 * listings a "new since" ask is about.
 */
async function browseServices({scope, companyIds, query, priceMin, priceMax, sort, skip, limit, filters}: PortalBrowseParams, narrowing: Record<string, unknown> = {}) {
    const filter = await buildShopListingFilter(scope.companyId, {search: query, categorySlug: filterValue(filters, "category"), priceMin, priceMax});
    if (!filter) return {items: [], total: 0};
    Object.assign(filter, narrowing, {company: {$in: companyIds}});
    const [listings, total] = await Promise.all([
        listingService.findCatalogRows<{_id: ObjectId; company: ObjectId; title: string; mainImage?: ObjectId; price?: number; priceCurrency?: CurrencyRef; address?: {city?: {name?: string}}; category?: {name?: string}; avgRating?: number; reviewCount?: number}>(filter, {
            select: "company title mainImage price priceCurrency address.city category avgRating reviewCount",
            populate: [{path: "priceCurrency", select: PORTAL_CURRENCY_SELECT}, {path: "address.city", select: "name"}, {path: "category", select: "name"}],
            sort: SHOP_LISTING_SORT_SPECS[sort ?? "newest"],
            skip,
            limit,
        }),
        listingService.count(filter, {withDeleted: false}),
    ]);
    const items = await catalogItems(listings, (listing) => ({
        kind: "service",
        id: listing._id.toString(),
        title: listing.title,
        subtitle: listing.category?.name,
        image: publicMediaUrl(listing.mainImage),
        ...(listing.price != null && listing.priceCurrency?.abbreviation ? {price: {amount: listing.price, currency: listing.priceCurrency.abbreviation}} : {}),
        city: listing.address?.city?.name,
        ...catalogRating(listing.avgRating, listing.reviewCount),
        section: "services",
        path: `/service?${new URLSearchParams({id: listing._id.toString()})}`,
    }));
    return {items, total};
}

/** The services section of the portal: the service listings of every provider company in scope. */
export function registerServicesPortalProvider(): void {
    registerPortalProvider({
        key: "services",
        order: 15,
        kinds: ["service"],
        companyIds: marketplacePortalCompanyIds,
        citiesByCompany: companyAddressCities,
        browse: (params) => browseServices(params),
        // Listings published after the date (D178): a saved search's alert, a person's kept items.
        newSince: (context: PortalNewSinceContext) => browseServices({...context, sort: "newest", skip: 0}, newSinceClause(context)),
    });
}
