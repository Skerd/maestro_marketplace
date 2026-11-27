import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

// The sellers run the marketplace, whatever the local `.env` enables.
vi.hoisted(() => {
    process.env.ENABLED_MODULES = "core,finance,marketplace";
});
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

import {ObjectId} from "mongodb";
import Company from "@coreModule/database/schemas/company/company";
import {PORTAL_ROOT_DOMAIN} from "@coreModule/environment";
import {asCrossTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {portalBuyerTargetHasModule} from "@coreModule/utilities/security/portalBuyer";
import MarketplaceConfig from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import Order from "@marketplaceModule/database/schemas/order/order";
import OrderMilestone from "@marketplaceModule/database/schemas/orderMilestone/orderMilestone";
import {jobsCompanyId, marketplaceJobLimits} from "@marketplaceModule/utilities/services/marketplacePlatform";
import {listingSeller, milestoneSeller, orderSeller, platformCompany} from "@marketplaceModule/utilities/services/portalBuyerTargets";

const platform = new ObjectId();
const seller = new ObjectId();
const acrossCompanies = <T>(fn: () => PromiseLike<T>): Promise<T> => asCrossTenant("test fixtures span companies", fn);
/** A portal buyer's request: its tenant is the buyer's own (platform) company. */
const asBuyer = <T>(fn: () => PromiseLike<T>): Promise<T> => withTenant(platform, fn);
const request = (body: Record<string, unknown>) => ({body, params: {}});
const apex = `http://${PORTAL_ROOT_DOMAIN}:5212`;

beforeAll(async () => {
    await connectTestDatabase();
    await MarketplaceConfig.init();
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => acrossCompanies(async () => {
    await Promise.all([MarketplaceConfig, Company, Listing, Order, OrderMilestone].map((model) => model.collection.deleteMany({})));
    await Company.collection.insertMany([
        // The platform company runs core only (D197).
        {_id: platform, name: "Platform", vat: "Z000000000Z", isActive: true, isPlatformOwner: true, modules: ["core"], deletedAt: null},
        {_id: seller, name: "Seller", vat: "Z523456789Z", isActive: true, isPlatformOwner: false, modules: ["core", "finance", "marketplace"], deletedAt: null},
    ]);
}));

describe("the platform company keeps the portal's jobs (D197)", () => {
    it("is where every portal job goes, and fails closed while there is no active platform company", async () => {
        expect(String(await asBuyer(() => jobsCompanyId("en-US")))).toBe(platform.toString());

        await Company.collection.updateOne({_id: platform}, {$set: {isActive: false}});
        await expect(asBuyer(() => jobsCompanyId("en-US"))).rejects.toMatchObject({error_code: "marketplace_unavailable"});

        await Company.collection.updateOne({_id: platform}, {$set: {isActive: true, isPlatformOwner: false}});
        await expect(asBuyer(() => jobsCompanyId("en-US"))).rejects.toMatchObject({error_code: "marketplace_unavailable"});
    });

    it("reads the job settings from the platform's own settings only", async () => {
        expect(await marketplaceJobLimits()).toEqual({});
        await acrossCompanies(() => MarketplaceConfig.collection.insertMany([
            // A provider's own numbers change nothing.
            {company: seller, currency: new ObjectId(), leadCap: 1, openJobLimit: 1, deletedAt: null},
            {company: platform, currency: new ObjectId(), leadCap: 7, openJobLimit: 3, deletedAt: null},
        ]));
        expect(await marketplaceJobLimits()).toEqual({leadCap: 7, openJobLimit: 3});
    });
});

describe("portal buyer targets (D143, D197, TD-B189)", () => {
    it("name the seller of the buyer's order, listing or milestone, from the buyer's own tenant", async () => {
        const order = new ObjectId();
        const listing = new ObjectId();
        const milestone = new ObjectId();
        await acrossCompanies(async () => {
            await Order.collection.insertOne({_id: order, company: seller, deletedAt: null});
            await Listing.collection.insertOne({_id: listing, company: seller, deletedAt: null});
            await OrderMilestone.collection.insertOne({_id: milestone, company: seller, order, deletedAt: null});
        });

        expect(String(await asBuyer(() => orderSeller("_id")(request({_id: order.toString()}))))).toBe(seller.toString());
        expect(String(await asBuyer(() => orderSeller("order")(request({order: order.toString()}))))).toBe(seller.toString());
        expect(String(await asBuyer(() => listingSeller(request({listing: listing.toString()}))))).toBe(seller.toString());
        expect(String(await asBuyer(() => milestoneSeller(request({milestone: milestone.toString()}))))).toBe(seller.toString());
    });

    it("name nothing for a missing or malformed id, and the platform company for what spans sellers", async () => {
        expect(await asBuyer(() => orderSeller("_id")(request({_id: new ObjectId().toString()})))).toBeUndefined();
        expect(await asBuyer(() => orderSeller("_id")(request({_id: "nope"})))).toBeUndefined();
        expect(await asBuyer(() => listingSeller(request({})))).toBeUndefined();
        expect(String(await asBuyer(() => platformCompany(request({}))))).toBe(platform.toString());
    });

    it("let the platform company answer the module gate for a module the server runs, from the portal only", async () => {
        const gate = (moduleName: string, origin = apex) => asBuyer(() => portalBuyerTargetHasModule(platformCompany, request({}), origin, moduleName));
        expect(await gate("marketplace")).toBe(true);
        // A module this server does not run, and a request from outside the portal, keep the gate shut.
        expect(await gate("carRental")).toBe(false);
        expect(await gate("marketplace", "http://localhost:5211")).toBe(false);

        await Company.collection.updateOne({_id: platform}, {$set: {isActive: false}});
        expect(await gate("marketplace")).toBe(false);
    });
});
