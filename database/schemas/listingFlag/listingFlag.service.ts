/**
 * ListingFlag Service
 */

import { BaseCrudService } from "@coreModule/database/services/baseCrudService";
import ListingFlag, {IListingFlag} from "./listingFlag";

export class ListingFlagService extends BaseCrudService<IListingFlag, typeof ListingFlag> {
    constructor() {
        super(ListingFlag, "ListingFlag");
    }
}

export const listingFlagService = new ListingFlagService();
