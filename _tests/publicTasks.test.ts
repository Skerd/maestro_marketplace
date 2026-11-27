import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

// The board and the sellers are found by their module, whatever the local `.env` enables.
vi.hoisted(() => {
    process.env.ENABLED_MODULES = "core,finance,marketplace";
});
/** The host of the request: a company's own site (its id), or the apex (undefined). */
const host = vi.hoisted(() => ({site: undefined as string | undefined}));

vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);
vi.mock("@coreModule/utilities/marketing/portalStorefront", async (importOriginal) => {
    const {setRequestTenant} = await import("@coreModule/utilities/endpoints/tenantScope");
    const {ObjectId: Id} = await import("mongodb");
    return {
        ...(await importOriginal<typeof import("@coreModule/utilities/marketing/portalStorefront")>()),
        resolveStorefrontContext: async () => {
            if (!host.site) return {mode: "platform", sessionCompany: {_id: new Id()}};
            setRequestTenant(new Id(host.site));
            return {mode: "tenant", company: {_id: new Id(host.site)}};
        },
    };
});

import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";
import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import request from "supertest";
import {appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import {asCrossTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {getPortalProvider} from "@coreModule/domain/portal/portalProviderRegistry";
import type {PortalBrowseParams} from "@coreModule/domain/portal/portalProvider.types";
import Company from "@coreModule/database/schemas/company/company";
import Currency from "@coreModule/database/schemas/currency/currency";
import City from "@coreModule/database/schemas/city/city";
import ListingCategory from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import MarketplaceConfig from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";
import TaskRequest from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import Bid from "@marketplaceModule/database/schemas/bid/bid";
import * as shopTaskRoute from "@marketplaceModule/api/marketplace/public/shopTask";
import {registerTasksPortalProvider} from "@marketplaceModule/domain/portal/tasksPortalProvider";
import {marketplacePortalCompanyIds} from "@marketplaceModule/utilities/shop/marketplaceSellers";
import {taskQuoteStats} from "@marketplaceModule/utilities/services/publicTasks";

// The service categories and the portal's tasks are the platform company's (D196, D197).
const platform = new ObjectId();
const fix = new ObjectId();
const pros = new ObjectId();
const buyer = new ObjectId();
const [eur, lek] = [new ObjectId(), new ObjectId()];
const [tirana, durres] = [new ObjectId(), new ObjectId()];
const categories = {home: new ObjectId(), plumbing: new ObjectId(), design: new ObjectId()};
const tasks = {tap: new ObjectId(), logo: new ObjectId(), fence: new ObjectId(), onFixSite: new ObjectId(), closed: new ObjectId(), expired: new ObjectId(), fixPanel: new ObjectId()};

const app = appFor([{...shopTaskRoute, module: "marketplace"}]);
const visitor: TestCaller = {userId: new ObjectId().toString(), companyId: new ObjectId().toString(), permissions: []};
const post = (body: object) => request(app).post("/api/marketplace/shopTask").set(callerHeader(visitor)).send(body);
const fixtures = <T>(fn: () => PromiseLike<T>): Promise<T> => asCrossTenant("test fixtures span companies", fn);
const DAY = 24 * 3600 * 1000;

registerTasksPortalProvider();
const board = getPortalProvider("tasks")!;
const browse = (fields: Partial<PortalBrowseParams> = {}) => fixtures(() => board.browse({
    kind: "task", scope: {}, companyIds: [platform], skip: 0, limit: 24, filters: {}, languageCode: "en-US", ...fields,
}));
const titles = (result: {items: {title: string}[]}) => result.items.map((item) => item.title);

beforeAll(async () => {
    await connectTestDatabase();
    await Bid.init();
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => fixtures(async () => {
    host.site = undefined;
    for (const collection of await mongoose.connection.db!.collections()) await collection.deleteMany({});
    const company = (_id: ObjectId, name: string, siteSlug: string) => ({_id, name, siteSlug, vat: `VAT-${name}`, isActive: true, modules: ["core", "finance", "marketplace"], deletedAt: null});
    await Company.collection.insertMany([company(fix, "Fix", "fix"), company(pros, "Pros", "pros"), {_id: platform, name: "Platform", vat: "VAT-Platform", isPlatformOwner: true, isActive: true, modules: ["core"], deletedAt: null}]);
    // The platform company keeps job settings, even listed on the portal: it runs no marketplace, so it sells nothing (D197).
    await MarketplaceConfig.collection.insertMany([
        {company: platform, currency: eur, listedOnPortal: true, deletedAt: null},
        {company: fix, currency: eur, listedOnPortal: true, deletedAt: null},
    ]);
    await Currency.collection.insertMany([
        {_id: eur, name: "Euro", abbreviation: "EUR", symbol: "€", decimalPlaces: 2, deletedAt: null},
        {_id: lek, name: "Lek", abbreviation: "ALL", symbol: "L", decimalPlaces: 0, deletedAt: null},
    ]);
    await City.collection.insertMany([{_id: tirana, name: "Tirana", deletedAt: null}, {_id: durres, name: "Durrës", deletedAt: null}]);
    const category = (_id: ObjectId, slug: string, delivery: string, parent?: ObjectId) =>
        ({_id, name: slug, slug, delivery, order: 0, company: platform, deletedAt: null, ...(parent ? {parentListingCategory: parent} : {})});
    await ListingCategory.collection.insertMany([
        category(categories.home, "home", "onsite"),
        category(categories.plumbing, "plumbing", "onsite", categories.home),
        category(categories.design, "design", "remote"),
    ]);
    const now = Date.now();
    const task = (_id: ObjectId, title: string, ageDays: number, fields: Record<string, unknown> = {}) => ({
        _id, title, name: title, description: `${title} please`, company: platform, requester: buyer, status: "open",
        expiresAt: new Date(now + 10 * DAY), createdAt: new Date(now - ageDays * DAY), currency: eur, deletedAt: null, ...fields,
    });
    const inTirana = {address: {street: "Rruga e Durrësit 5", postalCode: "1001", city: tirana, latitude: 41.3275, longitude: 19.8187}, approxPoint: {latitude: 41.329, longitude: 19.821}};
    await TaskRequest.collection.insertMany([
        task(tasks.tap, "Leaking tap", 3, {category: categories.plumbing, budgetMax: 80, ...inTirana}),
        task(tasks.logo, "Logo design", 2, {category: categories.design, budgetMax: 150}),
        task(tasks.fence, "Paint fence", 1, {category: categories.home, budgetMax: 5000, currency: lek, address: {city: durres, latitude: 41.32, longitude: 19.44}}),
        // Not on the board: posted on a provider's own site (D143), closed, past its expiry, or another company's own job.
        task(tasks.onFixSite, "Private job", 0, {category: categories.plumbing, restrictedToCompany: fix}),
        task(tasks.closed, "Closed job", 0, {category: categories.plumbing, status: "closed"}),
        task(tasks.expired, "Expired job", 0, {category: categories.plumbing, expiresAt: new Date(now - DAY)}),
        task(tasks.fixPanel, "Panel job", 0, {company: fix, category: categories.plumbing}),
    ]);
    const bid = (taskRequest: ObjectId, amount: number, status: string, bidderCompany = fix) =>
        ({taskRequest, amount, status, currency: eur, bidder: new ObjectId(), bidderCompany, proposal: "I can", deliveryDays: 2, company: platform, deletedAt: null});
    await Bid.collection.insertMany([
        bid(tasks.tap, 50, "pending"), bid(tasks.tap, 65.55, "pending"), bid(tasks.tap, 70, "accepted"), bid(tasks.tap, 10, "rejected", pros),
        bid(tasks.logo, 120, "pending"), bid(tasks.logo, 140, "pending", pros),
    ]);
}));

describe("public task board (D172)", {timeout: 30000}, () => {
    it("is the platform company's, on the apex only; the platform company is not in the services section", async () => {
        expect((await fixtures(() => board.companyIds({}))).map(String)).toEqual([platform.toString()]);
        expect((await withTenant(platform, () => board.companyIds({companyId: platform}))).map(String)).toEqual([platform.toString()]);
        expect(await withTenant(fix, () => board.companyIds({companyId: fix}))).toEqual([]);

        expect((await fixtures(() => marketplacePortalCompanyIds({}))).map(String)).toEqual([fix.toString()]);
        expect(await withTenant(platform, () => marketplacePortalCompanyIds({companyId: platform}))).toEqual([]);
        expect((await fixtures(() => board.citiesByCompany([platform]))).get(platform.toString())?.sort()).toEqual(["Durrës", "Tirana"]);
    });

    it("lists only open public tasks, newest first, with the budget as an 'up to' price", async () => {
        const page = await browse();
        expect(titles(page)).toEqual(["Paint fence", "Logo design", "Leaking tap"]);
        expect(page.total).toBe(3);
        expect(page.items[2]).toEqual({
            kind: "task", id: tasks.tap.toString(), title: "Leaking tap", subtitle: "plumbing", city: "Tirana",
            price: {amount: 80, currency: "EUR", upTo: true}, section: "tasks", path: `/task?id=${tasks.tap}`,
            company: {name: "Platform", slug: platform.toString()},
        });
    });

    it("filters by category subtree, on-site or online, words and city, and compares budgets in one currency", async () => {
        expect(titles(await browse({filters: {category: "home"}}))).toEqual(["Paint fence", "Leaking tap"]);
        expect(titles(await browse({filters: {delivery: "remote"}}))).toEqual(["Logo design"]);
        expect(titles(await browse({filters: {delivery: "onsite"}}))).toEqual(["Paint fence", "Leaking tap"]);
        expect(titles(await browse({query: "LOGO"}))).toEqual(["Logo design"]);
        expect(titles(await browse({city: "durr"}))).toEqual(["Paint fence"]);
        // Two tasks in EUR, one in ALL: budgets compare in the common currency unless the visitor picks one.
        expect(titles(await browse({sort: "priceAsc"}))).toEqual(["Leaking tap", "Logo design"]);
        expect(titles(await browse({priceMin: 100}))).toEqual(["Logo design"]);
        expect(titles(await browse({sort: "priceDesc", filters: {currency: "all"}}))).toEqual(["Paint fence"]);
    });

    it("counts the live quotes and averages them exactly, rounded once, from three quotes on", async () => {
        const stats = await fixtures(() => taskQuoteStats([{_id: tasks.tap, currency: {decimalPlaces: 2}}, {_id: tasks.logo}, {_id: tasks.fence}]));
        // (50 + 65.55 + 70) / 3 = 61.85 exactly; the rejected quote does not count.
        expect(stats.get(tasks.tap.toString())).toEqual({count: 3, average: 61.85});
        // Two quotes: the average would give each bidder the other's price.
        expect(stats.get(tasks.logo.toString())).toEqual({count: 2});
        expect(stats.get(tasks.fence.toString())).toEqual({count: 0});
    });

    it("shows one task to anyone without the street, pin, buyer or any quote's amount", async () => {
        const res = await post({id: tasks.tap.toString()});
        expect(res.status).toBe(200);
        const task = res.body.data;
        expect(task).toMatchObject({_id: tasks.tap.toString(), title: "Leaking tap", budgetMax: 80, status: "open", quotes: {count: 3, average: 61.85}});
        // The board it is posted on, and who quoted (once per company, a rejected quote not), by name and site only.
        expect(task.seller).toEqual({_id: platform.toString(), name: "Platform"});
        expect(task.quotedBy).toEqual([{_id: fix.toString(), name: "Fix", siteSlug: "fix"}]);
        const logo = (await post({id: tasks.logo.toString()})).body.data;
        expect(logo.quotedBy.map((company: {name: string}) => company.name).sort()).toEqual(["Fix", "Pros"]);
        expect(JSON.stringify(logo)).not.toMatch(/120|140/);
        expect(task.address.city.name).toBe("Tirana");
        expect(task.approxPoint).toEqual({latitude: 41.329, longitude: 19.821});
        const body = JSON.stringify(task);
        for (const secret of ["Rruga e Durrësit", "1001", "19.8187", "41.3275", buyer.toString(), "requester", "65.55", "50,", "70,"]) {
            expect(body).not.toContain(secret);
        }
    });

    it("hides a task posted on a provider's own site, and the board from every other company's site", async () => {
        expect((await post({id: tasks.onFixSite.toString()})).body.error_code).toBe("task_request_not_found");
        expect((await post({id: tasks.fixPanel.toString()})).body.error_code).toBe("task_request_not_found");

        host.site = platform.toString();
        expect((await post({id: tasks.tap.toString()})).status).toBe(200);
        host.site = fix.toString();
        expect((await post({id: tasks.tap.toString()})).body.error_code).toBe("task_request_not_found");
    });
});
