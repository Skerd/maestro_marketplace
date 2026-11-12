import type {ITaskLead} from "@marketplaceModule/database/schemas/taskLead/taskLead";
import type {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import type {IBid} from "@marketplaceModule/database/schemas/bid/bid";
import type {TaskLead, TaskLeadJob, TaskLeadQuote} from "armonia/src/modules/marketplace/api/marketplace/private/taskLead/taskLead.dto";
import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";
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
import {mapMedia, mapSnippet, nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";

/**
 * The job as a lead's provider sees it before the award (D143): city level only, no street, postcode, pin or buyer.
 * Built from the job read across companies; the lead itself never stores a copy.
 */
export function taskLeadJobToDTO(job: ITaskRequest): TaskLeadJob {
    return {
        _id: job._id.toString(),
        name: job.name,
        title: job.title,
        description: job.description,
        category: mapSnippet<ListingCategorySimple>()(job.category, ListingCategorySimpleSnippet),
        budgetMax: job.budgetMax,
        currency: mapSnippet<CurrencySimple>()(job.currency, CurrencySimpleSnippet),
        address: {
            country: mapSnippet<CountrySimple>()(job.address?.country, CountrySimpleSnippet),
            state: mapSnippet<StateSimple>()(job.address?.state, StateSimpleSnippet),
            city: mapSnippet<CitySimple>()(job.address?.city, CitySimpleSnippet),
        },
        status: job.status,
        expiresAt: job.expiresAt?.toISOString(),
        createdAt: job.createdAt?.toISOString(),
        mainImage: job.mainImage ? mapMedia(job.mainImage) : undefined,
        imageGallery: job.imageGallery?.length ? job.imageGallery.map(mapMedia) : undefined,
    };
}

export function taskLeadQuoteToDTO(bid: IBid): TaskLeadQuote {
    return {
        _id: bid._id.toString(),
        amount: bid.amount,
        currency: mapSnippet<CurrencySimple>()(bid.currency, CurrencySimpleSnippet),
        proposal: bid.proposal,
        deliveryDays: bid.deliveryDays,
        status: bid.status,
    };
}

export function taskLeadToDTO(lead: ITaskLead, job?: ITaskRequest | null, bid?: IBid | null): TaskLead {
    // Populated with its title by the lead routes; an unpopulated ref has none and is left out.
    const listingId = nestedEntityToRef(lead.listing);
    const listingTitle = lead.listing?.title;
    return {
        _id: lead._id.toString(),
        name: lead.name,
        status: lead.status,
        provider: mapSnippet<SimpleUser>()(lead.provider, SimpleUserSnippet),
        ...(listingId && listingTitle ? {listing: {_id: listingId.toString(), title: listingTitle}} : {}),
        ...(lead.distanceKm != null ? {distanceKm: lead.distanceKm} : {}),
        ...(job ? {taskRequest: taskLeadJobToDTO(job)} : {}),
        ...(bid ? {bid: taskLeadQuoteToDTO(bid)} : {}),
        ...mapSoftDeleteToDTO(lead),
        ...mapOwnershipToDTO(lead),
        ...mapLifeCycleToDTO(lead),
    };
}

export function taskLeadToSelect(lead: ITaskLead): ApiSelectDatum {
    return {value: lead._id.toString(), label: lead.name};
}
