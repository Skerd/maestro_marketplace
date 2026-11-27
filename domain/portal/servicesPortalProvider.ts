import type {ObjectId} from "mongodb";
import {registerPortalProvider} from "@coreModule/domain/portal/portalProviderRegistry";
import type {PortalBrowseParams, PortalNewSinceContext} from "@coreModule/domain/portal/portalProvider.types";
import {catalogItems, catalogRating, filterValue, idClause, itemPagePath, newSinceClause} from "@coreModule/domain/portal/portalCatalog";
import {companyAddressCities} from "@coreModule/utilities/marketing/portalCompanies";
import {publicMediaUrl} from "@coreModule/utilities/media/publicMediaUrl";
import {PORTAL_CURRENCY_SELECT} from "@coreModule/utilities/mappers/portal/portalStorefrontMapper.dto";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {buildShopListingFilter, SHOP_LISTING_SORT_SPECS} from "@marketplaceModule/utilities/shop/shopMarketplaceFilter";
import {marketplacePortalCompanyIds} from "@marketplaceModule/utilities/shop/marketplaceSellers";
import {listDisplayName, type ListNames} from "@coreModule/utilities/helpers/listNames";

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
        listingService.findCatalogRows<{_id: ObjectId; company: ObjectId; title: string; mainImage?: ObjectId; price?: number; priceCurrency?: CurrencyRef; address?: {city?: {name?: string}}; category?: {name?: string; names?: ListNames}; avgRating?: number; reviewCount?: number}>(filter, {
            select: "company title mainImage price priceCurrency address.city category avgRating reviewCount",
            populate: [{path: "priceCurrency", select: PORTAL_CURRENCY_SELECT}, {path: "address.city", select: "name"}, {path: "category", select: "name names"}],
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
        subtitle: listing.category ? listDisplayName(listing.category) : undefined,
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
        sitePath: "services",
        // As the portal names it: the section (sinfonia `portalSectionName`) and its kinds' tabs (`portalKindName`).
        names: {
            "en-US": {title: "Services", description: "Hire local providers for a job, or post one and compare their bids.", kinds: {service: "Services"}},
            "sq-AL": {title: "Shërbime", description: "Angazhoni ofrues pranë jush, ose publikoni një punë dhe krahasoni ofertat e tyre.", kinds: {service: "Shërbime"}},
            "it-IT": {title: "Servizi", description: "Affida un lavoro a fornitori della zona, oppure pubblica una richiesta e confronta le offerte.", kinds: {service: "Servizi"}},
            "fr-FR": {title: "Services", description: "Engagez des prestataires près de chez vous, ou publiez une demande et comparez leurs offres.", kinds: {service: "Services"}},
            "de-CH": {title: "Dienstleistungen", description: "Beauftragen Sie Anbieter aus der Nähe oder schreiben Sie einen Auftrag aus und vergleichen Sie die Angebote.", kinds: {service: "Dienstleistungen"}},
        },
        kinds: ["service"],
        companyIds: marketplacePortalCompanyIds,
        citiesByCompany: companyAddressCities,
        browse: (params) => browseServices(params),
        // Listings published after the date (D178): a saved search's alert, a person's kept items.
        newSince: (context: PortalNewSinceContext) => browseServices({...context, sort: "newest", skip: 0}, newSinceClause(context)),
        // A listing's page (D181): `/service?id=…`.
        itemAt: async ({scope, companyId, path, languageCode}) => {
            const {segments, query} = itemPagePath(path);
            const clause = segments[0] === "service" ? idClause(query.get("id")) : null;
            if (!clause) return undefined;
            const {items} = await browseServices({kind: "service", scope, companyIds: [companyId], filters: {}, skip: 0, limit: 1, languageCode}, clause);
            return items[0] ? {item: items[0], schemaType: "Service"} : undefined;
        },
    });
}
