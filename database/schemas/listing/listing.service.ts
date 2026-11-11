import type {FilterQuery} from "mongoose";
import { BaseCrudService } from "@coreModule/database/services/baseCrudService";
import type {CatalogPage} from "@coreModule/database/services/baseCrudService";
import Listing, { IListing } from "@marketplaceModule/database/schemas/listing/listing";

export class ListingService extends BaseCrudService<IListing, typeof Listing> {
    constructor() {
        super(Listing, "Listing");
    }

    /**
     * Live rows as plain objects for read-only catalog pages (the portal), typed by the caller's projection.
     * One page, sorted, with the given references populated.
     */
    findCatalogRows<Row>(filter: FilterQuery<IListing>, page: CatalogPage) {
        return Listing.find(filter).noDeleted()
            .select(page.select)
            .populate(page.populate)
            .sort(page.sort)
            .skip(page.skip).limit(page.limit)
            .lean<Row[]>();
    }
}

export const listingService = new ListingService();
