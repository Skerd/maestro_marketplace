import type {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import type {TaskRequest} from "armonia/src/modules/marketplace/api/marketplace/private/taskRequest/taskRequest.dto";
import type {CurrencySimple} from "armonia/src/modules/core/dto/currency.dto";
import type {CountrySimple} from "armonia/src/modules/core/dto/country.dto";
import type {StateSimple} from "armonia/src/modules/core/dto/state.dto";
import type {CitySimple} from "armonia/src/modules/core/dto/city.dto";
import type {SimpleUser} from "armonia/src/modules/core/dto/user.dto";
import type {ListingCategorySimple} from "armonia/src/modules/marketplace/dto/listingCategory.dto";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {CountrySimpleSnippet} from "@coreModule/database/schemas/country/country.snippets";
import {StateSimpleSnippet} from "@coreModule/database/schemas/state/state.snippets";
import {CitySimpleSnippet} from "@coreModule/database/schemas/city/city.snippets";
import {SimpleUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {ListingCategorySimpleSnippet} from "@marketplaceModule/database/schemas/listingCategory/listingCategory.snippets";
import {mapOwnershipToDTO, mapSoftDeleteToDTO, mapLifeCycleToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";
import {mapMedia, mapSnippet} from "@coreModule/utilities/mappers/common.mapper";

export function taskRequestToDTO(taskRequest: ITaskRequest, bidCount?: number): TaskRequest {
    return {
        _id: taskRequest._id.toString(),
        requester: mapSnippet<SimpleUser>()(taskRequest.requester, SimpleUserSnippet),
        name: taskRequest.name,
        title: taskRequest.title,
        description: taskRequest.description,
        category: mapSnippet<ListingCategorySimple>()(taskRequest.category, ListingCategorySimpleSnippet),
        budgetMin: taskRequest.budgetMin,
        budgetMax: taskRequest.budgetMax,
        currency: mapSnippet<CurrencySimple>()(taskRequest.currency, CurrencySimpleSnippet),
        address: taskRequest.address ? {
            street: taskRequest.address.street,
            postalCode: taskRequest.address.postalCode,
            country: mapSnippet<CountrySimple>()(taskRequest.address.country, CountrySimpleSnippet),
            state: mapSnippet<StateSimple>()(taskRequest.address.state, StateSimpleSnippet),
            city: mapSnippet<CitySimple>()(taskRequest.address.city, CitySimpleSnippet),
            latitude: taskRequest.address.latitude,
            longitude: taskRequest.address.longitude,
        } : undefined,
        expiresAt: taskRequest.expiresAt ? new Date(taskRequest.expiresAt).toISOString() : undefined,
        status: taskRequest.status,
        mainImage: taskRequest.mainImage ? mapMedia(taskRequest.mainImage) : undefined,
        imageGallery: taskRequest.imageGallery ? taskRequest.imageGallery.map(mapMedia) : undefined,
        videoGallery: taskRequest.videoGallery ? taskRequest.videoGallery.map(mapMedia) : undefined,
        bidCount,
        ...mapSoftDeleteToDTO(taskRequest),
        ...mapOwnershipToDTO(taskRequest),
        ...mapLifeCycleToDTO(taskRequest),
    };
}

export function taskRequestsToDTO(items: ITaskRequest[], bidCounts?: Map<string, number>): TaskRequest[] {
    return items.map((tr) => taskRequestToDTO(tr, bidCounts?.get(tr._id.toString())));
}
