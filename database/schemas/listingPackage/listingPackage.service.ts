import { BaseCrudService } from "@coreModule/database/services/baseCrudService";
import ListingPackage, {IListingPackage} from "./listingPackage";

export class ListingPackageService extends BaseCrudService<IListingPackage, typeof ListingPackage> {
    constructor() {
        super(ListingPackage, "ListingPackage");
    }
}

export const listingPackageService = new ListingPackageService();
