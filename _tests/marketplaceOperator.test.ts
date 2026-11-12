import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

// The operator must have the marketplace module, whatever the local `.env` enables.
vi.hoisted(() => {
    process.env.ENABLED_MODULES = "core,finance,marketplace";
});
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

import {ObjectId} from "mongodb";
import Company from "@coreModule/database/schemas/company/company";
import Currency from "@coreModule/database/schemas/currency/currency";
import {asCrossTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import MarketplaceConfig from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import Order from "@marketplaceModule/database/schemas/order/order";
import OrderMilestone from "@marketplaceModule/database/schemas/orderMilestone/orderMilestone";
import {seedCompanyDemoData} from "@marketplaceModule/database/companyDemoSeed";
import {
    MARKETPLACE_OPERATOR_VAT,
    findMarketplaceOperatorId,
    marketplaceOperatorCompanyId,
} from "@marketplaceModule/utilities/services/marketplaceOperator";
import {listingSeller, marketplaceOperator, milestoneSeller, orderSeller} from "@marketplaceModule/utilities/services/portalBuyerTargets";

const platform = new ObjectId();
const operator = new ObjectId();
const seller = new ObjectId();
const acrossCompanies = <T>(fn: () => PromiseLike<T>): Promise<T> => asCrossTenant("test fixtures span companies", fn);
/** A portal buyer's request: its tenant is the buyer's own (platform) company. */
const asBuyer = <T>(fn: () => PromiseLike<T>): Promise<T> => withTenant(platform, fn);

beforeAll(async () => {
    await connectTestDatabase();
    await MarketplaceConfig.init();
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => acrossCompanies(async () => {
    await Promise.all([MarketplaceConfig, Currency, Company, Listing, Order, OrderMilestone].map((model) => model.collection.deleteMany({})));
    const company = (_id: ObjectId, name: string, vat: string, modules: string[]) => ({_id, name, vat, isActive: true, modules, deletedAt: null});
    await Company.collection.insertMany([
        company(platform, "Platform", "Z000000000Z", ["core"]),
        company(operator, "Operator", MARKETPLACE_OPERATOR_VAT, ["core", "finance", "marketplace"]),
        company(seller, "Seller", "Z523456789Z", ["core", "finance", "marketplace"]),
    ]);
    await Currency.create({name: "Euro", symbol: "€", abbreviation: "EUR", decimalPlaces: 2, company: operator});
}));

/** Runs the marketplace demo seed for the operator company, as the company seed does. */
const seedOperator = () => withTenant(operator, async () => seedCompanyDemoData(undefined, await Company.findById(operator)));

describe("the marketplace operator (D143)", () => {
    it("is marked by the seed, stays off the seller list and gets no demo listings or orders", async () => {
        await seedOperator();
        await seedOperator();

        await acrossCompanies(async () => {
            const configs = await MarketplaceConfig.find({}).lean();
            expect(configs.map((config) => [String(config.company), config.isOperator, config.listedOnPortal]))
                .toEqual([[operator.toString(), true, false]]);
            expect(await Listing.countDocuments({})).toBe(0);
            expect(await Order.countDocuments({})).toBe(0);
        });
        expect(String(await asBuyer(() => marketplaceOperatorCompanyId("en-US")))).toBe(operator.toString());
    });

    it("is one per database", async () => {
        await seedOperator();
        await acrossCompanies(async () => {
            const currency = await Currency.create({name: "Euro", symbol: "€", abbreviation: "EUR", decimalPlaces: 2, company: seller});
            await expect(MarketplaceConfig.create({company: seller, currency: currency._id, isOperator: true})).rejects.toMatchObject({code: 11000});
        });
    });

    it("fails closed while there is none, or it is inactive or lacks the module", async () => {
        await expect(asBuyer(() => marketplaceOperatorCompanyId("en-US"))).rejects.toMatchObject({error_code: "marketplace_unavailable"});

        await seedOperator();
        await Company.collection.updateOne({_id: operator}, {$set: {modules: ["core"]}});
        await expect(asBuyer(() => marketplaceOperatorCompanyId("en-US"))).rejects.toMatchObject({error_code: "marketplace_unavailable"});

        await Company.collection.updateOne({_id: operator}, {$set: {modules: ["core", "finance", "marketplace"], isActive: false}});
        await expect(asBuyer(() => marketplaceOperatorCompanyId("en-US"))).rejects.toMatchObject({error_code: "marketplace_unavailable"});
    });
});

describe("portal buyer targets (D143, TD-B189)", () => {
    it("name the seller of the buyer's order, listing or milestone, from the buyer's own tenant", async () => {
        const order = new ObjectId();
        const listing = new ObjectId();
        const milestone = new ObjectId();
        await acrossCompanies(async () => {
            await Order.collection.insertOne({_id: order, company: seller, deletedAt: null});
            await Listing.collection.insertOne({_id: listing, company: seller, deletedAt: null});
            await OrderMilestone.collection.insertOne({_id: milestone, company: seller, order, deletedAt: null});
        });
        const request = (body: Record<string, unknown>) => ({body, params: {}});

        expect(String(await asBuyer(() => orderSeller("_id")(request({_id: order.toString()}))))).toBe(seller.toString());
        expect(String(await asBuyer(() => orderSeller("order")(request({order: order.toString()}))))).toBe(seller.toString());
        expect(String(await asBuyer(() => listingSeller(request({listing: listing.toString()}))))).toBe(seller.toString());
        expect(String(await asBuyer(() => milestoneSeller(request({milestone: milestone.toString()}))))).toBe(seller.toString());
    });

    it("name nothing for a missing or malformed id, and the operator for lists across sellers", async () => {
        const request = (body: Record<string, unknown>) => ({body, params: {}});
        expect(await asBuyer(() => orderSeller("_id")(request({_id: new ObjectId().toString()})))).toBeUndefined();
        expect(await asBuyer(() => orderSeller("_id")(request({_id: "nope"})))).toBeUndefined();
        expect(await asBuyer(() => listingSeller(request({})))).toBeUndefined();
        expect(await asBuyer(() => marketplaceOperator(request({})))).toBeUndefined();

        await seedOperator();
        expect(String(await asBuyer(() => marketplaceOperator(request({}))))).toBe(operator.toString());
        expect(await findMarketplaceOperatorId()).toBeDefined();
    });
});
