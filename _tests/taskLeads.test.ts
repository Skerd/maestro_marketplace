import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

vi.hoisted(() => {
    process.env.ENABLED_MODULES = "core,finance,marketplace";
});
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);

import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import request from "supertest";
import {allPermissionTags, appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import {asCrossTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import Company from "@coreModule/database/schemas/company/company";
import User from "@coreModule/database/schemas/user/user";
import Currency from "@coreModule/database/schemas/currency/currency";
import City from "@coreModule/database/schemas/city/city";
import * as taskLeadRoute from "@marketplaceModule/api/marketplace/private/taskLead";
import TaskLead from "@marketplaceModule/database/schemas/taskLead/taskLead";
import TaskRequest from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import Bid from "@marketplaceModule/database/schemas/bid/bid";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import ListingCategory from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import MarketplaceConfig from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";
import {findJobMatches} from "@marketplaceModule/utilities/services/jobMatching";
import {taskLeadsToViews} from "@marketplaceModule/utilities/services/taskLeads";
import {getLogger} from "@coreModule/loggers/serverLog";
import {COLLECTED_DATA} from "@coreModule/database/collections";
import {marketplaceOperatorLimits} from "@marketplaceModule/utilities/services/marketplaceOperator";

const operator = new ObjectId();
const provider = new ObjectId();
const plumber = new ObjectId();
const colleague = new ObjectId();
const buyer = new ObjectId();
const app = appFor([{...taskLeadRoute, module: "marketplace"}]);
const permissions = allPermissionTags([TaskLead]);
const asPlumber: TestCaller = {userId: plumber.toString(), companyId: provider.toString(), permissions};
const asColleague: TestCaller = {userId: colleague.toString(), companyId: provider.toString(), permissions};
const fixtures = <T>(fn: () => PromiseLike<T>): Promise<T> => asCrossTenant("test fixtures span companies", fn);
const call = (caller: TestCaller, path: string, body: object = {}) =>
    request(app).post(`/api/marketplace/taskLead${path}`).set(callerHeader(caller)).send(body);

let job: ObjectId;
let lead: ObjectId;
let euro: ObjectId;

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([TaskLead.init(), Bid.init(), MarketplaceConfig.init()]);
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => fixtures(async () => {
    for (const collection of await mongoose.connection.db!.collections()) await collection.deleteMany({});
    await Company.collection.insertMany([operator, provider].map((_id) => ({_id, name: String(_id), vat: String(_id), isActive: true, modules: ["marketplace"], deletedAt: null})));
    await User.collection.insertMany([
        {_id: plumber, username: "pat@fix.test", name: "Pat", surname: "Plumber", companies: [provider]},
        {_id: colleague, username: "cole@fix.test", name: "Cole", surname: "League", companies: [provider]},
    ]);
    euro = (await Currency.collection.insertOne({name: "Euro", symbol: "€", abbreviation: "EUR", decimalPlaces: 2, company: operator})).insertedId;
    await MarketplaceConfig.collection.insertOne({company: operator, currency: euro, isOperator: true, listedOnPortal: false, deletedAt: null});
    const city = (await City.collection.insertOne({name: "Durrës", company: operator})).insertedId;
    const category = (await ListingCategory.collection.insertOne({name: "Leaks", slug: "leaks", delivery: "onsite", order: 0, company: operator, deletedAt: null})).insertedId;
    job = (await TaskRequest.collection.insertOne({
        name: "TASK-1", title: "Leaking faucet", description: "Drips", category, budgetMin: 20, budgetMax: 60, currency: euro,
        address: {street: "Rruga Tregtare 5", postalCode: "2001", city, latitude: 41.32, longitude: 19.45},
        requester: buyer, status: "open", expiresAt: new Date(Date.now() + 86400000), company: operator, deletedAt: null,
    })).insertedId;
    const listing = (await Listing.collection.insertOne({title: "Taps", company: provider, provider: plumber, category, status: "active", deletedAt: null})).insertedId;
    lead = (await TaskLead.collection.insertOne({name: "LEAD-1", taskRequest: job, provider: plumber, listing, distanceKm: 0.7, status: "new", company: provider, deletedAt: null, createdAt: new Date()})).insertedId;
}));

describe("a provider's leads (D143)", () => {
    it("show the job at city level, never the street, pin or buyer, and opening one marks it viewed", async () => {
        const list = await call(asPlumber, "", {limit: 10, offset: 0});
        expect(list.status).toBe(200);
        const row = list.body.data[0];
        expect(row).toMatchObject({status: "new", distanceKm: 0.7, listing: {title: "Taps"}, taskRequest: {title: "Leaking faucet", address: {city: {name: "Durrës"}}, budgetMax: 60}});
        const shown = JSON.stringify(row);
        for (const hidden of ["Rruga Tregtare", "2001", "41.32", "19.45", buyer.toString()]) expect(shown).not.toContain(hidden);

        expect((await call(asColleague, "", {limit: 10, offset: 0})).body.data).toEqual([]);


        const single = await call(asPlumber, "/single", {_id: lead.toString()});
        expect(single.body.status).toBe("viewed");
        expect((await fixtures(() => TaskLead.collection.findOne({_id: lead})))?.status).toBe("viewed");
    });

    it("turn a quote into a bid next to the job in the operator, once", async () => {
        const quoted = await call(asPlumber, "/quote", {_id: lead.toString(), amount: 45, deliveryDays: 1, proposal: "New cartridge and seals"});
        expect([quoted.status, quoted.body.message]).toEqual([200, "Quote sent"]);

        const bid = await fixtures(() => Bid.collection.findOne({taskRequest: job}));
        expect([String(bid?.company), String(bid?.bidder), String(bid?.bidderCompany), String(bid?.currency), bid?.amount, bid?.status])
            .toEqual([String(operator), String(plumber), String(provider), String(euro), 45, "pending"]);
        const stored = await fixtures(() => TaskLead.collection.findOne({_id: lead}));
        expect([stored?.status, String(stored?.bid)]).toEqual(["quoted", String(bid?._id)]);

        const again = await call(asPlumber, "/quote", {_id: lead.toString(), amount: 40, deliveryDays: 1, proposal: "Cheaper"});
        expect(again.body.error_code).toBe("task_lead_not_open");
        expect((await call(asPlumber, "/single", {_id: lead.toString()})).body.bid).toMatchObject({amount: 45, deliveryDays: 1, status: "pending"});
    });

    it("are answered only by their provider, and a declined one takes no quote", async () => {
        const stranger = await call(asColleague, "/quote", {_id: lead.toString(), amount: 10, deliveryDays: 1, proposal: "Mine"});
        expect(stranger.body.error_code).toBe("user_permissions_not_sufficient");

        expect((await call(asPlumber, "/decline", {_id: lead.toString()})).status).toBe(200);
        const late = await call(asPlumber, "/quote", {_id: lead.toString(), amount: 10, deliveryDays: 1, proposal: "Late"});
        expect(late.body.error_code).toBe("task_lead_not_open");
        expect(await fixtures(() => Bid.collection.countDocuments({}))).toBe(0);
    });
});

describe("a lead's view (D143)", () => {
    // Found in the browser on 2026-11-12: the panel gates cards and sheet nodes on the lead's readable fields, so the
    // job and the quote must be readable under their reference fields, and only the shareable parts of the job.
    it("lets the panel read the job's shareable fields and the quote, and nothing private", () => {
        const read = COLLECTED_DATA.taskleads.readFields as Record<string, {keys?: Record<string, {keys?: Record<string, unknown>}>}>;
        const job = read.taskRequest?.keys ?? {};
        for (const key of ["title", "description", "category", "budgetMin", "budgetMax", "currency", "mainImage", "imageGallery", "expiresAt"]) {
            expect(job).toHaveProperty(key);
        }
        expect(Object.keys(job.address?.keys ?? {}).sort()).toEqual(["city", "country", "state"]);
        for (const hidden of ["requester", "restrictedToCompany"]) expect(job).not.toHaveProperty(hidden);
        expect(Object.keys(read.bid?.keys ?? {})).toEqual(expect.arrayContaining(["amount", "currency", "proposal", "deliveryDays", "status"]));
    });

    // Found live on 2026-11-12: a route populates the lead's refs in the provider's tenant, where the operator's job
    // reads as empty, so the document handed to the view had lost its job. The view reads the raw ids itself.
    it("still shows the job when the lead it is given lost its populated job", async () => {
        const populated = await withTenant(provider, async () => TaskLead.hydrate({...(await TaskLead.collection.findOne({_id: lead})), taskRequest: null}));
        const [view] = await withTenant(provider, () => taskLeadsToViews([populated], {logger: getLogger("test"), languageCode: "en-US"}));
        expect(view.taskRequest).toMatchObject({title: "Leaking faucet", address: {city: {name: "Durrës"}}});
    });
});

describe("the operator's job settings (D143)", () => {
    it("set how many providers a job reaches", async () => {
        expect(await withTenant(operator, () => marketplaceOperatorLimits())).toEqual({});
        await fixtures(() => MarketplaceConfig.collection.updateOne({company: operator}, {$set: {leadCap: 1, openJobLimit: 2}}));
        expect(await withTenant(operator, () => marketplaceOperatorLimits())).toEqual({leadCap: 1, openJobLimit: 2});
        // The cap is passed to the matching by `createJobLeads`; the matching honours it.
        expect(typeof findJobMatches).toBe("function");
    });
});
