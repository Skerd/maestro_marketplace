import type {ProviderProfileMetrics} from "@marketplaceModule/utilities/mappers/providerProfile/providerProfileMetrics";
import type {
    ShopListingAddOn,
    ShopListingCard,
    ShopListingDetail,
    ShopListingLocation,
    ShopListingPackage,
    ShopListingPromotion,
    ShopMarketplaceReview,
    ShopPlace,
    ShopProviderProfile,
    ShopProviderSummary,
} from "armonia/src/modules/marketplace/api/marketplace/public/shopMarketplace/shopMarketplace.types";
import type {ProviderAvailability} from "armonia/src/modules/marketplace/api/marketplace/private/providerProfile/providerProfile.dto";
import {toPortalCurrency, toPortalSeller} from "@coreModule/utilities/mappers/portal/portalStorefrontMapper.dto";
import type {PortalSeller} from "armonia/src/modules/core/api/portal/public/portal/portal.dto";

/** Populate paths for a listing card; the detail route adds packages and add-ons. */
export const SHOP_LISTING_CARD_POPULATE = [
    {path: "category", select: "name slug"},
    {path: "provider", select: "name surname"},
    {path: "company", select: "name logo siteSlug siteHost"},
    {path: "priceCurrency", select: "symbol abbreviation decimalPlaces"},
    {path: "address.country", select: "name"},
    {path: "address.state", select: "name"},
    {path: "address.city", select: "name"},
    {path: "listingPackages", select: "price.amount"},
];

export const SHOP_LISTING_CARD_FIELDS =
    "title mainImage category provider company price priceCurrency pricingType deliveryDays address avgRating reviewCount listingPackages createdAt";

/** Listing id → type of its currently running promotion. */
export type ShopPromotionMap = Map<string, ShopListingPromotion>;

function refId(value: any): string | undefined {
    if (!value) return undefined;
    return (value._id ?? value).toString();
}

function mediaIds(values: unknown): string[] | undefined {
    if (!Array.isArray(values) || values.length === 0) return undefined;
    return values.map(refId).filter((v): v is string => Boolean(v));
}

function toShopPlace(value: any): ShopPlace | undefined {
    if (!value || typeof value !== "object" || !value.name) return undefined;
    return {_id: value._id.toString(), name: value.name};
}

export function toShopListingLocation(address: any): ShopListingLocation | undefined {
    if (!address) return undefined;
    const location = {
        country: toShopPlace(address.country),
        state: toShopPlace(address.state),
        city: toShopPlace(address.city),
    };
    return location.country || location.state || location.city ? location : undefined;
}

export function toShopProviderSummary(user: any): ShopProviderSummary | undefined {
    if (!user || typeof user !== "object") return undefined;
    return {
        _id: user._id.toString(),
        name: [user.name, user.surname].filter(Boolean).join(" "),
    };
}

export function toShopListingCard(listing: any, promotions?: ShopPromotionMap): ShopListingCard {
    const packagePrices: number[] = Array.isArray(listing.listingPackages)
        ? listing.listingPackages
              .map((pkg: any) => pkg?.price?.amount)
              .filter((amount: unknown): amount is number => typeof amount === "number")
        : [];
    const prices = typeof listing.price === "number" ? [listing.price, ...packagePrices] : packagePrices;
    const category = listing.category && typeof listing.category === "object" && listing.category.name
        ? {_id: listing.category._id.toString(), name: listing.category.name, slug: listing.category.slug ?? ""}
        : undefined;

    const seller: PortalSeller | undefined = toPortalSeller(listing.company);

    return {
        _id: listing._id.toString(),
        title: listing.title ?? "",
        mainImage: refId(listing.mainImage),
        category,
        provider: toShopProviderSummary(listing.provider),
        price: listing.price,
        fromPrice: prices.length ? Math.min(...prices) : undefined,
        currency: toPortalCurrency(listing.priceCurrency),
        pricingType: listing.pricingType,
        deliveryDays: listing.deliveryDays,
        location: toShopListingLocation(listing.address),
        avgRating: listing.reviewCount ? listing.avgRating : undefined,
        reviewCount: listing.reviewCount || undefined,
        ...(seller ? {seller} : {}),
        promotion: promotions?.get(listing._id.toString()),
        packageCount: packagePrices.length || undefined,
    };
}

function toShopListingPackage(pkg: any): ShopListingPackage {
    return {
        _id: pkg._id.toString(),
        name: pkg.name ?? "",
        description: pkg.description || undefined,
        price: pkg.price?.amount ?? 0,
        currency: toPortalCurrency(pkg.price?.currency),
        deliveryDays: pkg.deliveryDays ?? 0,
    };
}

function toShopListingAddOn(addOn: any): ShopListingAddOn {
    return {
        _id: addOn._id.toString(),
        name: addOn.name ?? "",
        price: addOn.price?.amount ?? 0,
        currency: toPortalCurrency(addOn.price?.currency),
        deliveryDays: addOn.deliveryDays || undefined,
    };
}

/**
 * Public provider block: the profile's showcase fields, never its payout state. The windows come with their resolved
 * zone (`loadProviderAvailability`), so the shop can say which clock they are on.
 */
export function toShopProviderProfile(
    user: any,
    profile: any,
    availability: ProviderAvailability,
    metrics?: ProviderProfileMetrics,
): ShopProviderProfile {
    const hasWindows = availability.windows.length > 0;
    return {
        _id: user._id.toString(),
        name: [user.name, user.surname].filter(Boolean).join(" "),
        bio: profile?.bio || undefined,
        skills: profile?.skills?.length ? profile.skills : undefined,
        availability: hasWindows ? availability.windows : undefined,
        availabilityTimeZone: hasWindows ? availability.timeZone : undefined,
        portfolio: mediaIds(profile?.portfolio),
        averageRating: metrics?.reviewCount ? metrics.averageRating : undefined,
        reviewCount: metrics?.reviewCount || undefined,
        completionRate: metrics?.completionRate,
        memberSince: user.createdAt ? new Date(user.createdAt).toISOString() : undefined,
    };
}

export function toShopListingDetail(
    listing: any,
    packages: any[],
    addOns: any[],
    provider: ShopProviderProfile | undefined,
    related: ShopListingCard[],
    promotions?: ShopPromotionMap,
): ShopListingDetail {
    return {
        ...toShopListingCard(listing, promotions),
        description: listing.description || undefined,
        gallery: mediaIds(listing.imageGallery),
        faqs: listing.faqs?.length
            ? listing.faqs.map((faq: any) => ({question: faq.question, answer: faq.answer}))
            : undefined,
        requirements: listing.requirements?.length ? listing.requirements : undefined,
        tags: listing.tags?.length ? listing.tags : undefined,
        packages: packages.map(toShopListingPackage),
        addOns: addOns.map(toShopListingAddOn),
        provider,
        related,
    };
}

/** Reviewer shown as first name plus surname initial, as product reviews are. */
export function toShopMarketplaceReview(review: any): ShopMarketplaceReview {
    const reviewer = review.reviewer;
    const reviewerName = reviewer && typeof reviewer === "object"
        ? [reviewer.name, reviewer.surname?.[0] ? `${reviewer.surname[0]}.` : undefined].filter(Boolean).join(" ")
        : undefined;
    return {
        _id: review._id.toString(),
        rating: review.rating,
        comment: review.comment || undefined,
        reviewerName: reviewerName || undefined,
        listingTitle: review.listing && typeof review.listing === "object" ? review.listing.title : undefined,
        createdAt: review.createdAt ? new Date(review.createdAt).toISOString() : undefined,
    };
}
