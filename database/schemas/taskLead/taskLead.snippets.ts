import {defineSnippet} from "@coreModule/database/utilities/snippet";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {CountrySimpleSnippet} from "@coreModule/database/schemas/country/country.snippets";
import {StateSimpleSnippet} from "@coreModule/database/schemas/state/state.snippets";
import {CitySimpleSnippet} from "@coreModule/database/schemas/city/city.snippets";
import type {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import type {IBid} from "@marketplaceModule/database/schemas/bid/bid";
import {ListingCategorySimpleSnippet} from "@marketplaceModule/database/schemas/listingCategory/listingCategory.snippets";
import type {TaskLeadJob, TaskLeadQuote} from "armonia/src/modules/marketplace/api/marketplace/private/taskLead/taskLead.dto";

/**
 * What a lead's provider may see of the job before the award (D143): the address only down to the city, and never
 * the buyer. It is also the panel's field access for `taskRequest.*` on a lead.
 */
export const TaskLeadJobSnippet = defineSnippet<ITaskRequest, TaskLeadJob>()({
    keys: {
        _id: {},
        name: {},
        title: {},
        description: {},
        category: ListingCategorySimpleSnippet,
        budgetMax: {},
        currency: CurrencySimpleSnippet,
        address: {keys: {country: CountrySimpleSnippet, state: StateSimpleSnippet, city: CitySimpleSnippet}},
        status: {},
        expiresAt: {},
        createdAt: {},
        mainImage: {},
        imageGallery: {},
    },
});

/** The quote a provider placed from a lead. */
export const TaskLeadQuoteSnippet = defineSnippet<IBid, TaskLeadQuote>()({
    keys: {
        _id: {},
        amount: {},
        currency: CurrencySimpleSnippet,
        proposal: {},
        deliveryDays: {},
        status: {},
    },
});
