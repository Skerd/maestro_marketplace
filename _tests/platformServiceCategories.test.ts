import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

vi.hoisted(() => {
    process.env.ENABLED_MODULES = "core,finance,marketplace";
});
import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import request from "supertest";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

const platformId = new ObjectId();
const sellerId = new ObjectId();
const userId = new ObjectId();

// authMW as production runs it for these routes: the session company's name and platform flag.
vi.mock("@coreModule/utilities/middlewares/authMW", async () => {
    const {authMWStub} = await import("@coreModule/_tests/httpHarness");
    return {
        default: (scope?: string) => (req: {body: Record<string, unknown>}, res: unknown, next: () => void) =>
            authMWStub.default(scope)(req, res, () => {
                const company = req.body.company as {_id: ObjectId};
                req.body.company = {...company, name: company._id.equals(platformId) ? "Kudoo" : "Tirana Fix", isPlatformOwner: company._id.equals(platformId)};
                next();
            }),
    };
});
vi.mock("@coreModule/utilities/middlewares/rateLimiter", () => ({
    rateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("@coreModule/domain/notifications/notificationEventBus", async (importOriginal) => ({
    ...await importOriginal<typeof import("@coreModule/domain/notifications/notificationEventBus")>(),
    emitNotificationEvent: vi.fn(),
}));

import {allPermissionTags, appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import {asCrossTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {getLogger} from "@coreModule/loggers/serverLog";
import Company from "@coreModule/database/schemas/company/company";
import * as listingCategoryRoute from "@marketplaceModule/api/marketplace/private/listingCategory";
import ListingCategory from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import MarketplaceConfig from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";
import {seedServiceTaxonomy, loadServiceTaxonomyFile, type ServiceTaxonomyFile} from "@marketplaceModule/database/seeds/taxonomy/serviceTaxonomy.seed";
import {listingServiceAreaFields} from "@marketplaceModule/utilities/services/serviceArea";
import {listingCategoryScope} from "@marketplaceModule/utilities/shop/shopMarketplaceFilter";

const logger = getLogger("platform_service_categories_test");
const app = appFor([{...listingCategoryRoute, module: "marketplace"}]);
const tags = allPermissionTags([ListingCategory, Listing, MarketplaceConfig]);
const asPlatform: TestCaller = {userId: userId.toString(), companyId: platformId.toString(), isAdmin: true, permissions: tags, modules: ["core", "marketplace"]};
const asSeller: TestCaller = {userId: userId.toString(), companyId: sellerId.toString(), isAdmin: true, permissions: tags, modules: ["core", "marketplace"]};
const acrossCompanies = <T>(fn: () => PromiseLike<T>): Promise<T> => asCrossTenant("test fixtures span companies", fn);
const call = (caller: TestCaller, method: "post" | "put" | "patch" | "delete", path: string, body: object = {}) =>
    request(app)[method](`/api/marketplace/listingCategory${path}`).set(callerHeader(caller)).send(body);

const names = (en: string, sq: string) => ({en, sq, de: `${en} DE`, fr: `${en} FR`, it: `${en} IT`});
const TAXONOMY: ServiceTaxonomyFile = {
    source: {release: "test"},
    categories: [
        {id: "home-services", parent: null, order: 1, slug: "home-services", delivery: "onsite", name: names("Home Services", "Shërbime shtëpiake")},
        {id: "home-plumbing", parent: "home-services", order: 1, slug: "home-plumbing", delivery: "onsite", name: names("Plumbing", "Hidraulikë")},
        {id: "home-plumbing-leaks", parent: "home-plumbing", order: 1, slug: "home-plumbing-leaks", delivery: "onsite", name: names("Leaks & Taps", "Rrjedhje dhe rubinete")},
        {id: "design-creative", parent: null, order: 2, slug: "design-creative", delivery: "remote", name: names("Graphics & Design", "Grafikë dhe dizajn")},
        {id: "design-logo-branding", parent: "design-creative", order: 1, slug: "design-logo-branding", delivery: "remote", name: names("Logo & Brand Identity", "Logo dhe identitet")},
    ],
};

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => acrossCompanies(async () => {
    for (const collection of await mongoose.connection.db!.collections()) {
        await collection.deleteMany({});
    }
    await Company.collection.insertMany([
        {_id: platformId, company: platformId, name: "Kudoo", vat: "P-1", isPlatformOwner: true, isActive: true, modules: ["core"], createdBy: userId, deletedAt: null},
        {_id: sellerId, company: sellerId, name: "Tirana Fix", vat: "S-1", isActive: true, modules: ["core", "marketplace"], createdBy: userId, deletedAt: null},
    ]);
}));

const seedTree = async (data: ServiceTaxonomyFile = TAXONOMY) => {
    const company = await Company.findById(platformId);
    if (!company) throw new Error("no platform");
    await seedServiceTaxonomy({platformCompany: company, logger}, data);
};
const bySlug = async (slug: string) => ListingCategory.collection.findOne({slug});
const idOf = async (slug: string): Promise<ObjectId> => {
    const row = await bySlug(slug);
    if (!row) throw new Error(`no category ${slug}`);
    return row._id;
};

describe("the platform service taxonomy file (D196)", () => {
    it("has about 3,000 entries in 30 sections, 4 levels, every name in 5 languages", () => {
        const data = loadServiceTaxonomyFile();
        expect(data).not.toBeNull();
        const rows = data?.categories ?? [];
        const ids = new Set(rows.map((row) => row.id));
        expect(ids.size).toBe(rows.length);
        expect(rows.filter((row) => row.parent === null)).toHaveLength(30);
        expect(rows.length).toBeGreaterThan(2500);
        const parentOf = new Map(rows.map((row) => [row.id, row.parent]));
        const seen = new Set<string>();
        for (const row of rows) {
            // Parents come first, which the seed relies on.
            if (row.parent) expect(seen.has(row.parent)).toBe(true);
            seen.add(row.id);
            let depth = 1;
            for (let parent = row.parent; parent; parent = parentOf.get(parent) ?? null) depth++;
            expect(depth).toBeLessThanOrEqual(4);
            for (const language of ["en", "sq", "de", "fr", "it"] as const) expect(row.name[language].trim()).not.toBe("");
            expect(["onsite", "remote"]).toContain(row.delivery);
        }
        // The slugs demo data and links used before D196 are still there.
        for (const slug of ["home-plumbing-leaks", "dev-website", "biz-legal", "life-tutoring", "photo-portrait"]) expect(ids.has(slug)).toBe(true);
    });
});

describe("seeding the platform tree (D196)", {timeout: 30000}, () => {
    it("adds the tree once, then follows a later edit of the file by taxonomy id", async () => {
        await seedTree();
        await seedTree();
        expect(await ListingCategory.collection.countDocuments({})).toBe(5);
        const leaks = await bySlug("home-plumbing-leaks");
        expect(leaks).toMatchObject({name: "Leaks & Taps", delivery: "onsite", requestStatus: "approved", taxonomyId: "home-plumbing-leaks"});
        expect(String(leaks?.company)).toBe(platformId.toString());
        expect(leaks?.names?.sq).toBe("Rrjedhje dhe rubinete");
        expect(leaks?.searchText).toContain("rrjedhje dhe rubinete");
        expect(String(leaks?.parentListingCategory)).toBe(String((await bySlug("home-plumbing"))?._id));
        expect(String(leaks?.branch)).toBe(String((await bySlug("home-services"))?._id));

        const next: ServiceTaxonomyFile = {source: {release: "test-2"}, categories: [
            ...TAXONOMY.categories.filter((row) => row.id !== "design-logo-branding" && row.id !== "home-plumbing-leaks"),
            {id: "home-plumbing-leaks", parent: "home-plumbing", order: 1, slug: "home-plumbing-leaks", delivery: "onsite", name: names("Leak Repair", "Riparim rrjedhjesh")},
        ]};
        await seedTree(next);
        expect((await bySlug("home-plumbing-leaks"))?.name).toBe("Leak Repair");
        expect((await bySlug("design-logo-branding"))?.deletedAt).toBeInstanceOf(Date);
    });

    it("moves the operator's old rows to the platform in place, so listings keep their category", async () => {
        const operatorId = new ObjectId();
        const legacy = new ObjectId();
        const custom = new ObjectId();
        await ListingCategory.collection.insertMany([
            {_id: legacy, company: operatorId, name: "Leaks & Taps", slug: "home-plumbing-leaks", delivery: "onsite", order: 1, deletedAt: null},
            {_id: custom, company: operatorId, name: "Kite Repair", slug: "kite-repair", delivery: "remote", order: 9, deletedAt: null},
        ]);
        await seedTree();
        const leaks = await bySlug("home-plumbing-leaks");
        expect(String(leaks?._id)).toBe(String(legacy));
        expect(String(leaks?.company)).toBe(platformId.toString());
        expect(leaks?.names?.sq).toBe("Rrjedhje dhe rubinete");
        // A category the operator added by hand stays, now the platform's, outside the taxonomy.
        expect(await ListingCategory.collection.findOne({_id: custom})).toMatchObject({company: platformId, deletedAt: null});
        expect(await ListingCategory.collection.countDocuments({company: operatorId})).toBe(0);
    });
});

describe("a company asks for a service (D160 request)", {timeout: 30000}, () => {
    it("stores another company's create as a request and the platform's as approved; only the platform edits", async () => {
        await seedTree();
        const requested = await call(asSeller, "put", "", {name: "Kite Repair", delivery: "remote"});
        expect(requested.body.error_code ?? "ok").toBe("ok");
        const kite = await ListingCategory.collection.findOne({name: "Kite Repair"});
        expect(kite).toMatchObject({requestStatus: "requested", requestedByCompany: sellerId});
        expect(String(kite?.company)).toBe(platformId.toString());

        const added = await call(asPlatform, "put", "", {name: "Chimney Sweeping", names: {sq: "Pastrim oxhaqesh"}, delivery: "onsite"});
        expect(added.body.error_code ?? "ok").toBe("ok");
        const chimney = await ListingCategory.collection.findOne({name: "Chimney Sweeping"});
        expect(chimney).toMatchObject({requestStatus: "approved", searchText: "chimney sweeping | pastrim oxhaqesh"});

        const plumbing = await idOf("home-plumbing");
        const rename = await call(asSeller, "patch", "", {_id: String(plumbing), name: "Pipes"});
        expect(rename.body.error_code).toBe("platform_company_required");
    });

    it("finds a category in any language, and names it in the reader's", async () => {
        await seedTree();
        const found = await call(asSeller, "post", "/select", {page: 1, limit: 20, name: "hidraulik"});
        expect(found.body.error_code ?? "ok").toBe("ok");
        expect(found.body.data.map((option: {label: string}) => option.label)).toEqual(["Home Services › Plumbing"]);
        // The hierarchy view: one level at a time, with each section's child count.
        const top = await call(asSeller, "post", "/tree", {});
        expect(top.body.data.map((node: {name: string; childCount: number}) => [node.name, node.childCount])).toEqual([["Home Services", 1], ["Graphics & Design", 1]]);
    });
});

describe("What we provide (D196)", {timeout: 30000}, () => {
    const labels = async (body: Record<string, unknown>) => {
        const res = await call(asSeller, "post", "/select", {page: 1, limit: 50, ...body});
        expect(res.body.error_code ?? "ok").toBe("ok");
        return res.body.data.map((option: {label: string}) => option.label).sort();
    };

    it("offers the sections to pick, and narrows the listing picker to the picked ones", async () => {
        await seedTree();
        expect(await labels({topLevel: true})).toEqual(["Graphics & Design", "Home Services"]);
        expect(await labels({inCompanyBranches: true})).toContain("Graphics & Design › Logo & Brand Identity");

        const home = await idOf("home-services");
        await MarketplaceConfig.collection.insertOne({company: sellerId, currency: new ObjectId(), listedOnPortal: true, isOperator: false, branches: [home], deletedAt: null});
        const offered = await labels({inCompanyBranches: true});
        expect(offered).toContain("Plumbing › Leaks & Taps");
        expect(offered).not.toContain("Graphics & Design › Logo & Brand Identity");
    });
});

describe("listings in other companies use the platform's categories", {timeout: 30000}, () => {
    it("store and read one, and the platform cannot delete it while it is used", async () => {
        await seedTree();
        const plumbing = await idOf("home-plumbing");
        const listing = await withTenant(sellerId, async () => {
            const created = await Listing.create({
                title: "Taps", category: plumbing, provider: userId, mainImage: new ObjectId(), company: sellerId, createdBy: userId,
                serviceArea: {latitude: 41.32, longitude: 19.45, radiusKm: 25},
            });
            return Listing.findById(created._id).populate("category", "name delivery");
        });
        expect(listing?.category).toMatchObject({name: "Plumbing", delivery: "onsite"});

        const removal = await call(asPlatform, "delete", "", {_id: String(plumbing)});
        expect([removal.status, removal.body.error_code]).toEqual([400, "cannot_delete_has_relations"]);
    });

    it("browse a section with every category below it", async () => {
        await seedTree();
        const scope = await listingCategoryScope("home-services");
        expect(scope?.map(String).sort()).toEqual([
            String((await bySlug("home-services"))?._id),
            String((await bySlug("home-plumbing"))?._id),
            String((await bySlug("home-plumbing-leaks"))?._id),
        ].sort());
        expect(await listingCategoryScope("no-such-section")).toBeNull();
    });
});

describe("a listing's service area (D143)", {timeout: 30000}, () => {
    const opts = {};

    it("is required for on-site work and stored with its GeoJSON point", async () => {
        await seedTree();
        const plumbing = await idOf("home-plumbing");
        await expect(withTenant(sellerId, () => listingServiceAreaFields(plumbing, undefined, "en-US", opts)))
            .rejects.toMatchObject({error_code: "listing_service_area_required"});

        const fields = await withTenant(sellerId, () =>
            listingServiceAreaFields(plumbing, {latitude: 41.32, longitude: 19.45, radiusKm: 25}, "en-US", opts));
        expect(fields).toEqual({
            serviceArea: {latitude: 41.32, longitude: 19.45, radiusKm: 25},
            serviceAreaPoint: {type: "Point", coordinates: [19.45, 41.32]},
        });
    });

    it("is dropped for remote work, and a category outside the platform's tree is refused", async () => {
        await seedTree();
        const design = await idOf("design-creative");
        expect(await withTenant(sellerId, () => listingServiceAreaFields(design, {latitude: 1, longitude: 2, radiusKm: 3}, "en-US", opts)))
            .toEqual({serviceArea: null, serviceAreaPoint: null});

        const stray = await acrossCompanies(async () =>
            (await ListingCategory.collection.insertOne({name: "Stray", slug: "stray", delivery: "onsite", company: sellerId, deletedAt: null})).insertedId);
        await expect(withTenant(sellerId, () => listingServiceAreaFields(stray, undefined, "en-US", opts)))
            .rejects.toMatchObject({error_code: "not_found"});
    });
});
