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
import {getLogger} from "@coreModule/loggers/serverLog";
import * as listingCategoryRoute from "@marketplaceModule/api/marketplace/private/listingCategory";
import ListingCategory from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import MarketplaceConfig from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";
import {createCategories} from "@marketplaceModule/database/schemas/listingCategory/listingCategory.defaults";
import {listingServiceAreaFields} from "@marketplaceModule/utilities/services/serviceArea";

const operatorId = new ObjectId();
const sellerId = new ObjectId();
const userId = new ObjectId();
const app = appFor([{...listingCategoryRoute, module: "marketplace"}]);
// Both hold every category permission: the seller is refused by the operator rule, not by its role (D144).
const permissions = allPermissionTags([ListingCategory, Listing]);
const operatorAdmin: TestCaller = {userId: userId.toString(), companyId: operatorId.toString(), isAdmin: true, permissions};
const sellerAdmin: TestCaller = {userId: userId.toString(), companyId: sellerId.toString(), isAdmin: true, permissions};
const acrossCompanies = <T>(fn: () => PromiseLike<T>): Promise<T> => asCrossTenant("test fixtures span companies", fn);
const call = (caller: TestCaller, method: "post" | "put" | "patch" | "delete", path: string, body: object = {}) =>
    request(app)[method](`/api/marketplace/listingCategory${path}`).set(callerHeader(caller)).send(body);

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([MarketplaceConfig.init(), ListingCategory.init()]);
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => acrossCompanies(async () => {
    for (const collection of await mongoose.connection.db!.collections()) {
        await collection.deleteMany({});
    }
    await MarketplaceConfig.collection.insertOne({company: operatorId, currency: new ObjectId(), isOperator: true, listedOnPortal: false, deletedAt: null});
}));

async function seedCategory(name: string, delivery: "onsite" | "remote" = "remote"): Promise<ObjectId> {
    const {insertedId} = await ListingCategory.collection.insertOne({name, slug: `lcat-${name.toLowerCase()}`, order: 0, delivery, company: operatorId, deletedAt: null});
    return insertedId;
}

describe("the shared service category tree (D144)", () => {
    it("is seeded once in the operator, with delivery inherited down the tree and no demo marker", async () => {
        await createCategories(getLogger("test"), {_id: operatorId, createdBy: userId} as never);

        const rows = await ListingCategory.collection.find({}).toArray();
        const bySlug = new Map(rows.map((row) => [row.slug, row]));
        expect(new Set(rows.map((row) => String(row.company)))).toEqual(new Set([operatorId.toString()]));
        expect(bySlug.get("home-services")?.delivery).toBe("onsite");
        expect(bySlug.get("home-plumbing-leaks")?.delivery).toBe("onsite");
        expect(bySlug.get("photo-portrait")?.delivery).toBe("onsite");
        expect(bySlug.get("dev-website")?.delivery).toBe("remote");
        expect(bySlug.get("home-plumbing-leaks")?.name).toBe("Leaks & Taps");
    });

    it("is read by every company and changed only by the operator", async () => {
        const plumbing = await seedCategory("Plumbing", "onsite");

        expect((await call(sellerAdmin, "post", "/access")).body.data).toEqual({canManage: false});
        expect((await call(operatorAdmin, "post", "/access")).body.data).toEqual({canManage: true});

        const select = await call(sellerAdmin, "post", "/select", {page: 1, limit: 20});
        expect(select.status).toBe(200);
        expect(JSON.stringify(select.body)).toContain(plumbing.toString());

        const refused = await call(sellerAdmin, "put", "", {name: "Roofing", delivery: "onsite"});
        expect([refused.status, refused.body.error_code]).toEqual([403, "listing_category_operator_only"]);
        const rename = await call(sellerAdmin, "patch", "", {_id: plumbing.toString(), name: "Pipes"});
        expect([rename.status, rename.body.error_code]).toEqual([403, "listing_category_operator_only"]);
        const removal = await call(sellerAdmin, "delete", "", {_id: plumbing.toString()});
        expect([removal.status, removal.body.error_code]).toEqual([403, "listing_category_operator_only"]);

        const created = await call(operatorAdmin, "put", "", {name: "Roofing", delivery: "onsite"});
        expect(created.status).toBe(200);
        expect(await ListingCategory.collection.findOne({name: "Roofing"})).toMatchObject({company: operatorId, delivery: "onsite"});
    });

    it("is not deleted while another company's listing uses it", async () => {
        const plumbing = await seedCategory("Plumbing", "onsite");
        await acrossCompanies(() => Listing.collection.insertOne({title: "Taps", category: plumbing, company: sellerId, status: "active", deletedAt: null}));

        const removal = await call(operatorAdmin, "delete", "", {_id: plumbing.toString()});
        expect([removal.status, removal.body.error_code]).toEqual([400, "cannot_delete_has_relations"]);
    });

    it("lets a listing in another company store and read a shared category", async () => {
        const plumbing = await seedCategory("Plumbing", "onsite");
        const listing = await withTenant(sellerId, async () => {
            const created = await Listing.create({
                title: "Taps", category: plumbing, provider: userId, mainImage: new ObjectId(), company: sellerId, createdBy: userId,
            });
            return Listing.findById(created._id).populate("category", "name delivery");
        });
        expect(listing?.category).toMatchObject({name: "Plumbing", delivery: "onsite"});
    });
});

describe("a listing's service area (D143)", () => {
    const opts = {};

    it("is required for on-site work and stored with its GeoJSON point", async () => {
        const plumbing = await seedCategory("Plumbing", "onsite");
        await expect(withTenant(sellerId, () => listingServiceAreaFields(plumbing, undefined, "en-US", opts)))
            .rejects.toMatchObject({error_code: "listing_service_area_required"});

        const fields = await withTenant(sellerId, () =>
            listingServiceAreaFields(plumbing, {latitude: 41.32, longitude: 19.45, radiusKm: 25}, "en-US", opts));
        expect(fields).toEqual({
            serviceArea: {latitude: 41.32, longitude: 19.45, radiusKm: 25},
            serviceAreaPoint: {type: "Point", coordinates: [19.45, 41.32]},
        });
    });

    it("is dropped for remote work, and a category outside the shared tree is refused", async () => {
        const design = await seedCategory("Design", "remote");
        expect(await withTenant(sellerId, () => listingServiceAreaFields(design, {latitude: 1, longitude: 2, radiusKm: 3}, "en-US", opts)))
            .toEqual({serviceArea: null, serviceAreaPoint: null});

        const stray = await acrossCompanies(async () =>
            (await ListingCategory.collection.insertOne({name: "Stray", slug: "stray", delivery: "onsite", company: sellerId, deletedAt: null})).insertedId);
        await expect(withTenant(sellerId, () => listingServiceAreaFields(stray, undefined, "en-US", opts)))
            .rejects.toMatchObject({error_code: "not_found"});
    });
});
