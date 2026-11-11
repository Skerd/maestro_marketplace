import type {ObjectId} from "mongodb";
import {registerPortalProvider} from "@coreModule/domain/portal/portalProviderRegistry";
import type {PortalBrowseParams} from "@coreModule/domain/portal/portalProvider.types";
import {catalogItems, filterValue} from "@coreModule/domain/portal/portalCatalog";
import {companyAddressCities} from "@coreModule/utilities/marketing/portalCompanies";
import {publicMediaUrl} from "@coreModule/utilities/media/publicMediaUrl";
import {PORTAL_CURRENCY_SELECT} from "@coreModule/utilities/mappers/portal/portalStorefrontMapper.dto";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {buildShopListingFilter, SHOP_LISTING_SORT_SPECS} from "@marketplaceModule/utilities/shop/shopMarketplaceFilter";
import {marketplacePortalCompanyIds} from "@marketplaceModule/utilities/shop/marketplaceSellers";

type CurrencyRef = {abbreviation?: string};

/** Active service listings, with the marketplace's own category filter (`f.category`). */
async function browseServices({scope, companyIds, query, priceMin, priceMax, sort, skip, limit, filters}: PortalBrowseParams) {
    const filter = await buildShopListingFilter(scope.companyId, {search: query, categorySlug: filterValue(filters, "category"), priceMin, priceMax});
    if (!filter) return {items: [], total: 0};
    filter.company = {$in: companyIds};
    const [listings, total] = await Promise.all([
        listingService.findCatalogRows<{_id: ObjectId; company: ObjectId; title: string; mainImage?: ObjectId; price?: number; priceCurrency?: CurrencyRef; address?: {city?: {name?: string}}; category?: {name?: string}}>(filter, {
            select: "company title mainImage price priceCurrency address.city category",
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
        browse: browseServices,
    });
}
