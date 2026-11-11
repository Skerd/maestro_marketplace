import { BaseCrudService } from "@coreModule/database/services/baseCrudService";
import ListingCategory, { IListingCategory } from "@marketplaceModule/database/schemas/listingCategory/listingCategory";

export class ListingCategoryService extends BaseCrudService<IListingCategory, typeof ListingCategory> {
    constructor() {
        super(ListingCategory, "ListingCategory");
    }
}

export const listingCategoryService = new ListingCategoryService();
