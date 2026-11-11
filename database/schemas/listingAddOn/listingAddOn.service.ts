import { BaseCrudService } from "@coreModule/database/services/baseCrudService";
import ListingAddOn, {IListingAddOn} from "./listingAddOn";

export class ListingAddOnService extends BaseCrudService<IListingAddOn, typeof ListingAddOn> {
    constructor() {
        super(ListingAddOn, "ListingAddOn");
    }
}

export const listingAddOnService = new ListingAddOnService();
