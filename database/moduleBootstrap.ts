/** Must be the first import: `addModelData` snapshots REF_SELECT_REGISTRY while models load. */
import {registerMarketplaceRefSelects} from "armonia/src/modules/marketplace/database/filter/refSelect";
import type {Model} from "mongoose";
import MarketplaceConfig from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";
import ListingCategory from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import TaskRequest from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import Bid from "@marketplaceModule/database/schemas/bid/bid";
import TaskLead from "@marketplaceModule/database/schemas/taskLead/taskLead";
import Order from "@marketplaceModule/database/schemas/order/order";
import Review from "@marketplaceModule/database/schemas/review/review";
import ListingPackage from "@marketplaceModule/database/schemas/listingPackage/listingPackage";
import ListingAddOn from "@marketplaceModule/database/schemas/listingAddOn/listingAddOn";
import ProviderProfile from "@marketplaceModule/database/schemas/providerProfile/providerProfile";
import Booking from "@marketplaceModule/database/schemas/booking/booking";
import Dispute from "@marketplaceModule/database/schemas/dispute/dispute";
import Promotion from "@marketplaceModule/database/schemas/promotion/promotion";
import OrderDelivery from "@marketplaceModule/database/schemas/orderDelivery/orderDelivery";
import OrderMilestone from "@marketplaceModule/database/schemas/orderMilestone/orderMilestone";
import OrderRevision from "@marketplaceModule/database/schemas/orderRevision/orderRevision";
import {registerPublicMediaBackfillSource} from "@coreModule/utilities/media/publicMediaBackfillRegistry";
import {registerDefaultRoles} from "@coreModule/database/schemas/role/role.defaults";
import {marketplaceDefaultRoles} from "@marketplaceModule/database/schemas/role/marketplace.role.defaults";
import {ListingSchemaDef} from "armonia/src/modules/marketplace/api/marketplace/private/listing/listing.schema-def";
import {TaskRequestSchemaDef} from "armonia/src/modules/marketplace/api/marketplace/private/taskRequest/taskRequest.schema-def";
import {marketplaceConfigService} from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig.service";
import type {SelfServeBusinessType} from "@coreModule/domain/company/selfServeBusinessTypes";
import {marketplaceReportables} from "@marketplaceModule/domain/reports/marketplaceReportables";
import {seedServiceTaxonomy} from "@marketplaceModule/database/seeds/taxonomy/serviceTaxonomy.seed";

export const marketplaceModels: Model<any>[] = [
    MarketplaceConfig,
    ListingCategory,
    Listing,
    TaskRequest,
    TaskLead,
    Bid,
    Order,
    Review,
    ListingPackage,
    ListingAddOn,
    ProviderProfile,
    Booking,
    Dispute,
    Promotion,
    OrderDelivery,
    OrderMilestone,
    OrderRevision,
];

export async function dropMarketplaceCollections(): Promise<void> {
    for (const model of marketplaceModels) {
        try {
            await model.collection.drop();
        } catch {
            // collection may not exist
        }
    }
}

registerDefaultRoles(marketplaceDefaultRoles);
registerMarketplaceRefSelects();
registerPublicMediaBackfillSource({
    name: "Listing",
    schemaDef: ListingSchemaDef,
    loadModel: () => import("@marketplaceModule/database/schemas/listing/listing").then((m) => m.default),
});
registerPublicMediaBackfillSource({
    name: "TaskRequest",
    schemaDef: TaskRequestSchemaDef,
    loadModel: () => import("@marketplaceModule/database/schemas/taskRequest/taskRequest").then((m) => m.default),
});

/** A services company (provider) may sign itself up on the portal; it is listed there once the platform approves it (D178). */
const selfServeBusinessTypes: SelfServeBusinessType[] = [{
    key: "marketplace",
    modules: ["marketplace"],
    onCreated: async ({company, session, logger, languageCode}) => {
        const config = await marketplaceConfigService.getOrCreateForCompany(company._id, {session, logger, languageCode});
        await marketplaceConfigService.updateOne({_id: config._id}, {$set: {listedOnPortal: true}}, {session, logger});
    },
}];

export const moduleBootstrap = {
    models: marketplaceModels,
    dropModuleCollections: dropMarketplaceCollections,
    defaultRoles: marketplaceDefaultRoles,
    selfServeBusinessTypes,
    // Listings, task requests, bids and reviews people can report to the platform's desk (D191).
    reportables: marketplaceReportables,
    // The platform's service category tree (D196), seeded into the platform company at every database setup.
    platformLists: seedServiceTaxonomy,
};
