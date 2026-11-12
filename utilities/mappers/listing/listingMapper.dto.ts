import type {IListing} from "@marketplaceModule/database/schemas/listing/listing";
import type {Listing} from "armonia/src/modules/marketplace/api/marketplace/private/listing/listing.dto";
import type {CurrencySimple} from "armonia/src/modules/core/dto/currency.dto";
import type {CountrySimple} from "armonia/src/modules/core/dto/country.dto";
import type {StateSimple} from "armonia/src/modules/core/dto/state.dto";
import type {CitySimple} from "armonia/src/modules/core/dto/city.dto";
import type {SimpleUser} from "armonia/src/modules/core/dto/user.dto";
import type {ListingCategorySimple} from "armonia/src/modules/marketplace/dto/listingCategory.dto";
import type {PromotionSimple} from "armonia/src/modules/marketplace/dto/promotion.dto";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {CountrySimpleSnippet} from "@coreModule/database/schemas/country/country.snippets";
import {StateSimpleSnippet} from "@coreModule/database/schemas/state/state.snippets";
import {CitySimpleSnippet} from "@coreModule/database/schemas/city/city.snippets";
import {SimpleUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {ListingCategorySimpleSnippet} from "@marketplaceModule/database/schemas/listingCategory/listingCategory.snippets";
import {PromotionSimpleSnippet} from "@marketplaceModule/database/schemas/promotion/promotion.snippets";
import {mapMedia, mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {
    mapLifeCycleToDTO,
    mapOwnershipToDTO,
    mapSoftDeleteToDTO
} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";
import {listingPackageToDTO} from "@marketplaceModule/utilities/mappers/listingPackage/listingPackageMapper.dto";
import {listingAddOnToDTO} from "@marketplaceModule/utilities/mappers/listingAddOn/listingAddOnMapper.dto";

export function listingToDTO(listing: IListing): Listing {
    return {
        _id: listing._id.toString(),
        name: listing.name,
        title: listing.title,
        description: listing.description,
        category: mapSnippet<ListingCategorySimple>()(listing.category, ListingCategorySimpleSnippet),
        provider: mapSnippet<SimpleUser>()(listing.provider, SimpleUserSnippet),
        price: listing.price,
        priceCurrency: mapSnippet<CurrencySimple>()(listing.priceCurrency, CurrencySimpleSnippet),
        status: listing.status,
        pricingType: listing.pricingType,
        deliveryDays: listing.deliveryDays,
        tags: listing.tags,
        address: listing.address ? {
            country: mapSnippet<CountrySimple>()(listing.address.country, CountrySimpleSnippet),
            state: mapSnippet<StateSimple>()(listing.address.state, StateSimpleSnippet),
            city: mapSnippet<CitySimple>()(listing.address.city, CitySimpleSnippet),
        } : undefined,
        serviceArea: listing.serviceArea?.radiusKm != null
            ? {latitude: listing.serviceArea.latitude, longitude: listing.serviceArea.longitude, radiusKm: listing.serviceArea.radiusKm}
            : undefined,
        mainImage: listing.mainImage ? mapMedia(listing.mainImage) : undefined,
        imageGallery: listing.imageGallery?.map(mapMedia),
        videoGallery: listing.videoGallery?.length ? listing.videoGallery.map(mapMedia) : undefined,
        faqs: listing.faqs,
        requirements: listing.requirements,
        promotions: listing.promotions
            ?.map((p) => mapSnippet<PromotionSimple>()(p, PromotionSimpleSnippet))
            .filter((p): p is PromotionSimple => p != null),
        listingPackages: listing.listingPackages?.map((pkg) => listingPackageToDTO(pkg)) || undefined,
        listingAddOns: listing.listingAddOns?.map((addon) => listingAddOnToDTO(addon)) || undefined,
        avgRating: listing.avgRating ?? 0,
        reviewCount: listing.reviewCount ?? 0,
        ...mapSoftDeleteToDTO(listing),
        ...mapOwnershipToDTO(listing),
        ...mapLifeCycleToDTO(listing),
    };
}

export function listingsToDTO(listings: IListing[]): Listing[] {
    return listings.map(listingToDTO);
}
