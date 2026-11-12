import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import request from "supertest";

const companyId = new ObjectId();
/** The tests act on this company's data, as its requests and jobs do (D16). */
const asCompany = <T>(fn: () => PromiseLike<T>): Promise<T> => withTenant(companyId, fn);

vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);
// Public routes find the tenant from the request origin; the tests run as one shop
vi.mock("@coreModule/utilities/marketing/portalStorefront", async (importOriginal) => {
    // Resolves like the real one, including the request's tenant (D16).
    const {setRequestTenant} = await import("@coreModule/utilities/endpoints/tenantScope");
    return {
        ...(await importOriginal<typeof import("@coreModule/utilities/marketing/portalStorefront")>()),
        resolveStorefrontContext: async () => {
            setRequestTenant(companyId);
            return {mode: "tenant", company: {_id: companyId}};
        },
    };
});

import {appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import User from "@coreModule/database/schemas/user/user";
import Currency from "@coreModule/database/schemas/currency/currency";
import City from "@coreModule/database/schemas/city/city";
import * as shopListingsRoute from "@marketplaceModule/api/marketplace/public/shopListings";
import * as shopListingRoute from "@marketplaceModule/api/marketplace/public/shopListing";
import * as shopListingTaxonomyRoute from "@marketplaceModule/api/marketplace/public/shopListingTaxonomy";
import * as shopProviderRoute from "@marketplaceModule/api/marketplace/public/shopProvider";
import * as shopReviewsRoute from "@marketplaceModule/api/marketplace/public/shopMarketplaceReviews";
import * as orderRoute from "@marketplaceModule/api/marketplace/private/order";
import * as reviewRoute from "@marketplaceModule/api/marketplace/private/review";
import * as disputeRoute from "@marketplaceModule/api/marketplace/private/dispute";
import * as taskRequestRoute from "@marketplaceModule/api/marketplace/private/taskRequest";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import ListingCategory from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import MarketplaceConfig from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";
import ListingPackage from "@marketplaceModule/database/schemas/listingPackage/listingPackage";
import ListingAddOn from "@marketplaceModule/database/schemas/listingAddOn/listingAddOn";
import Promotion from "@marketplaceModule/database/schemas/promotion/promotion";
import ProviderProfile from "@marketplaceModule/database/schemas/providerProfile/providerProfile";
import Order from "@marketplaceModule/database/schemas/order/order";
import Review from "@marketplaceModule/database/schemas/review/review";
import Dispute from "@marketplaceModule/database/schemas/dispute/dispute";
import TaskRequest from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import Bid from "@marketplaceModule/database/schemas/bid/bid";
import {withTenant} from "@coreModule/utilities/endpoints/tenantScope";

const otherCompanyId = new ObjectId();
// The shared category tree lives in the marketplace operator (D144), not in the seller.
const operatorId = new ObjectId();
const currencyId = new ObjectId();
const providerId = new ObjectId();
const customerId = new ObjectId();
const strangerId = new ObjectId();
// Marketplace routes run with tenant scoping enforced (D16), as in the dev profiles.
const app = appFor([
    shopListingsRoute, shopListingRoute, shopListingTaxonomyRoute, shopProviderRoute, shopReviewsRoute,
    orderRoute, reviewRoute, disputeRoute, taskRequestRoute].map((route) => ({...route, module: "marketplace"})));

// Shop sign-ups hold the Web Client role, which has no model permissions
const customer: TestCaller = {userId: customerId.toString(), companyId: companyId.toString(), permissions: []};
const stranger: TestCaller = {userId: strangerId.toString(), companyId: companyId.toString(), permissions: []};
const visitor = customer;

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([Order.init(), Review.init(), Dispute.init(), Bid.init()]);
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => asCompany(async () => {
    for (const collection of await mongoose.connection.db!.collections()) {
        await collection.deleteMany({});
    }
    await User.collection.insertMany([
        {_id: providerId, username: "pat", name: "Pat", surname: "Painter", email: "pat@provider.test", phoneNumber: "+100", companies: [companyId], createdAt: new Date("2025-01-01")},
        {_id: customerId, username: "cam", name: "Cam", surname: "Customer", email: "cam@customer.test", companies: [companyId]},
    ]);
    // Reference data belongs to each company, as seeded (D16 scopes it like any tenant data).
    await Currency.collection.insertOne({_id: currencyId, name: "Euro", symbol: "€", abbreviation: "EUR", decimalPlaces: 2, company: companyId});
    await MarketplaceConfig.collection.insertOne({company: operatorId, currency: new ObjectId(), isOperator: true, listedOnPortal: false, deletedAt: null});
}));

async function seedCategory(name: string, parent?: ObjectId): Promise<{_id: ObjectId; slug: string}> {
    const slug = `lcat-${name.toLowerCase()}`;
    const {insertedId} = await ListingCategory.collection.insertOne({name, slug, order: 0, delivery: "remote", company: operatorId, ...(parent && {parentListingCategory: parent})});
    return {_id: insertedId, slug};
}

async function seedListing(overrides: Record<string, unknown> = {}): Promise<ObjectId> {
    const {insertedId} = await Listing.collection.insertOne({
        name: `LIST-${new ObjectId().toString()}`,
        title: "Wall painting",
        category: new ObjectId(),
        provider: providerId,
        price: 100,
        priceCurrency: currencyId,
        pricingType: "fixed",
        deliveryDays: 3,
        status: "active",
        mainImage: new ObjectId(),
        listingPackages: [],
        company: companyId,
        createdAt: new Date(),
        ...overrides,
    });
    return insertedId;
}

async function seedPackage(listing: ObjectId, amount: number): Promise<ObjectId> {
    const {insertedId} = await ListingPackage.collection.insertOne({
        listing, provider: providerId, name: `Pack ${amount}`, price: {amount, currency: currencyId}, deliveryDays: 5, order: 0, company: companyId,
    });
    await Listing.collection.updateOne({_id: listing}, {$push: {listingPackages: insertedId} as any});
    return insertedId;
}

async function seedOrder(customerRef: ObjectId, status = "completed", listing?: ObjectId): Promise<ObjectId> {
    const {insertedId} = await Order.collection.insertOne({
        name: `ORD-${new ObjectId().toString()}`,
        listing: listing ?? await seedListing(),
        customer: customerRef,
        provider: providerId,
        amount: 100,
        currency: currencyId,
        status,
        company: companyId,
        createdAt: new Date(),
    });
    return insertedId;
}

const post = (path: string, body: object, caller: TestCaller = visitor) =>
    request(app).post(path).set(callerHeader(caller)).send(body);
const put = (path: string, body: object, caller: TestCaller = customer) =>
    request(app).put(path).set(callerHeader(caller)).send(body);

describe("public marketplace catalog", {timeout: 30000}, () => {
    it("lists only the shop's active listings, with their lowest price and no private fields", () => asCompany(async () => {
        const visible = await seedListing({price: 100});
        await seedPackage(visible, 60);
        await seedPackage(visible, 250);
        await seedListing({status: "draft", title: "Draft"});
        await seedListing({company: otherCompanyId, title: "Elsewhere"});

        const res = await post("/api/marketplace/shopListings", {});
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(1);
        const [card] = res.body.data;
        expect(card).toMatchObject({_id: visible.toString(), price: 100, fromPrice: 60, packageCount: 2, provider: {name: "Pat Painter"}});
        expect(card.currency).toMatchObject({abbreviation: "EUR", decimalPlaces: 2});
        expect(JSON.stringify(res.body)).not.toContain("pat@provider.test");
    }));

    it("puts listings with a running promotion first in the recommended order", () => asCompany(async () => {
        const older = await seedListing({title: "Older", createdAt: new Date("2025-01-01")});
        const newer = await seedListing({title: "Newer", createdAt: new Date("2026-01-01")});
        const day = 24 * 60 * 60 * 1000;
        await Promotion.collection.insertOne({
            listing: older, type: "sponsored", lifecycleStatus: "active",
            startAt: new Date(Date.now() - day), endAt: new Date(Date.now() + day), company: companyId,
        });

        const recommended = await post("/api/marketplace/shopListings", {});
        expect(recommended.body.data.map((card: {_id: string}) => card._id)).toEqual([older.toString(), newer.toString()]);
        expect(recommended.body.data[0].promotion).toBe("sponsored");

        const newest = await post("/api/marketplace/shopListings", {sort: "newest"});
        expect(newest.body.data.map((card: {_id: string}) => card._id)).toEqual([newer.toString(), older.toString()]);
    }));

    it("filters by a parent category (children included) and by city", () => asCompany(async () => {
        const parent = await seedCategory("Home");
        const child = await seedCategory("Painting", parent._id);
        const other = await seedCategory("Design");
        const cityId = new ObjectId();
        await City.collection.insertOne({_id: cityId, name: "Tirana", company: companyId});
        const inChild = await seedListing({category: child._id, address: {city: cityId}});
        await seedListing({category: other._id});

        const byParent = await post("/api/marketplace/shopListings", {categorySlug: parent.slug});
        expect(byParent.body.data.map((card: {_id: string}) => card._id)).toEqual([inChild.toString()]);

        const byCity = await post("/api/marketplace/shopListings", {cityId: cityId.toString()});
        expect(byCity.body.data.map((card: {_id: string}) => card._id)).toEqual([inChild.toString()]);
        expect(byCity.body.data[0].location).toEqual({city: {_id: cityId.toString(), name: "Tirana"}});

        const unknown = await post("/api/marketplace/shopListings", {categorySlug: "nope"});
        expect(unknown.body.total).toBe(0);

        const taxonomy = await post("/api/marketplace/shopListingTaxonomy", {});
        expect(taxonomy.body.data.listingCount).toBe(2);
        expect(taxonomy.body.data.locations).toContainEqual({city: {_id: cityId.toString(), name: "Tirana"}});
        expect(taxonomy.body.data.categories.find((category: {slug: string}) => category.slug === child.slug))
            .toMatchObject({parent: parent._id.toString(), listingCount: 1});
    }));

    it("shows a listing's packages, add-ons and provider showcase, never payout state", () => asCompany(async () => {
        const listing = await seedListing();
        await seedPackage(listing, 180);
        await ListingAddOn.collection.insertOne({listing, provider: providerId, name: "Express", price: {amount: 20, currency: currencyId}, deliveryDays: 0, company: companyId});
        await ProviderProfile.collection.insertOne({
            user: providerId, company: companyId, bio: "Ten years of walls", skills: ["Interior"],
            availability: [{dayOfWeek: 1, startTime: "09:00", endTime: "17:00"}], timezone: "Europe/Berlin",
            stripeAccountId: "acct_secret", stripePayoutsEnabled: true,
        });

        const res = await post("/api/marketplace/shopListing", {id: listing.toString()});
        expect(res.status).toBe(200);
        expect(res.body.data.packages).toMatchObject([{name: "Pack 180", price: 180, deliveryDays: 5}]);
        expect(res.body.data.addOns).toMatchObject([{name: "Express", price: 20}]);
        expect(res.body.data.provider).toMatchObject({name: "Pat Painter", bio: "Ten years of walls", skills: ["Interior"]});
        // TD-F41: the windows carry the zone they are in
        expect(res.body.data.provider).toMatchObject({
            availability: [{dayOfWeek: 1, startTime: "09:00", endTime: "17:00"}],
            availabilityTimeZone: "Europe/Berlin",
        });
        expect(JSON.stringify(res.body)).not.toMatch(/acct_secret|stripe|pat@provider/);

        await Listing.collection.updateOne({_id: listing}, {$set: {status: "inactive"}});
        const hidden = await post("/api/marketplace/shopListing", {id: listing.toString()});
        expect(hidden.body.error_code).toBe("listing_not_found");
    }));

    it("gives a provider page only to users with an active listing", () => asCompany(async () => {
        const none = await post("/api/marketplace/shopProvider", {id: customerId.toString()});
        expect(none.body.error_code).toBe("provider_not_found");

        await seedListing();
        const page = await post("/api/marketplace/shopProvider", {id: providerId.toString()});
        expect(page.status).toBe(200);
        expect(page.body.data.provider.name).toBe("Pat Painter");
        // No profile, no windows: no zone to show either
        expect(page.body.data.provider.availabilityTimeZone).toBeUndefined();
        expect(page.body.data.listings).toHaveLength(1);

        const reviews = await post("/api/marketplace/shopMarketplaceReviews", {providerId: customerId.toString()});
        expect(reviews.body.error_code).toBe("provider_not_found");
    }));
});

describe("buyer self-service routes", {timeout: 30000}, () => {
    it("lists and opens only the caller's own orders", () => asCompany(async () => {
        const mine = await seedOrder(customerId, "in_progress");
        await seedOrder(strangerId, "in_progress");

        const list = await post("/api/marketplace/order/my", {}, customer);
        expect(list.status).toBe(200);
        expect(list.body.data.map((order: {_id: string}) => order._id)).toEqual([mine.toString()]);
        expect(list.body.data[0]).toMatchObject({status: "in_progress", reviewed: false, deliverySubmitted: false});

        const single = await post("/api/marketplace/order/mySingle", {_id: mine.toString()}, customer);
        expect(single.body.data).toMatchObject({_id: mine.toString(), deliveries: [], milestones: [], revisions: [], bookings: []});

        const notMine = await post("/api/marketplace/order/mySingle", {_id: mine.toString()}, stranger);
        expect(notMine.body.error_code).toBe("order_not_found");
    }));

    it("lets a customer without permissions review a completed order once, updating the listing rating", () => asCompany(async () => {
        const listing = await seedListing();
        const order = await seedOrder(customerId, "completed", listing);

        // The panel route still needs the model permission the Web Client role lacks
        const crud = await put("/api/marketplace/review", {order: order.toString(), rating: 4});
        expect(crud.status).not.toBe(200);

        const created = await put("/api/marketplace/review/createMine", {order: order.toString(), rating: 4, comment: "Neat work"});
        expect(created.status).toBe(200);
        expect((await Listing.findById(listing))!.toObject()).toMatchObject({avgRating: 4, reviewCount: 1});

        const again = await put("/api/marketplace/review/createMine", {order: order.toString(), rating: 5});
        expect(again.body.error_code).toBe("order_already_reviewed");

        const strangerReview = await put("/api/marketplace/review/createMine", {order: (await seedOrder(customerId)).toString(), rating: 1}, stranger);
        expect(strangerReview.body.error_code).toBe("only_customer_can_review");

        const listed = await post("/api/marketplace/order/my", {status: "completed"}, customer);
        expect(listed.body.data.find((item: {_id: string}) => item._id === order.toString()).reviewed).toBe(true);
    }));

    it("lets a customer open one dispute on an active order", () => asCompany(async () => {
        const order = await seedOrder(customerId, "in_progress");

        const opened = await put("/api/marketplace/dispute/createMine", {order: order.toString(), reason: "Wrong colour"});
        expect(opened.status).toBe(200);
        expect(await Dispute.countDocuments({order})).toBe(1);

        const single = await post("/api/marketplace/order/mySingle", {_id: order.toString()}, customer);
        expect(single.body.data.hasActiveDispute).toBe(true);

        const second = await put("/api/marketplace/dispute/createMine", {order: order.toString(), reason: "Again"});
        expect(second.body.error_code).toBe("dispute_already_exists_for_order");
    }));

    it("lists the caller's task requests and shows the bids on their own only", () => asCompany(async () => {
        const base = {
            title: "Paint my flat", description: "", category: new ObjectId(), budgetMin: 100, budgetMax: 300, currency: currencyId,
            address: {street: "S", postalCode: "1000", country: new ObjectId(), city: new ObjectId(), latitude: 41, longitude: 19},
            mainImage: new ObjectId(), status: "open", expiresAt: new Date(Date.now() + 86400000), company: companyId,
        };
        const {insertedId: mine} = await TaskRequest.collection.insertOne({...base, name: "TASK-1", requester: customerId});
        await TaskRequest.collection.insertOne({...base, name: "TASK-2", requester: strangerId});
        await Bid.collection.insertOne({
            name: "BID-1", taskRequest: mine, bidder: providerId, amount: 200, currency: currencyId,
            proposal: "Two coats", deliveryDays: 4, status: "pending", company: companyId,
        });

        const list = await post("/api/marketplace/taskRequest/my", {}, customer);
        expect(list.body.data.map((task: {_id: string}) => task._id)).toEqual([mine.toString()]);
        expect(list.body.data[0].bidCount).toBe(1);

        const single = await post("/api/marketplace/taskRequest/mySingle", {_id: mine.toString()}, customer);
        expect(single.body.data.bids).toMatchObject([{amount: 200, proposal: "Two coats", bidder: {name: "Pat"}}]);

        const notMine = await post("/api/marketplace/taskRequest/mySingle", {_id: mine.toString()}, stranger);
        expect(notMine.body.error_code).toBe("task_request_not_found");
    }));

    it("returns the new order id when a customer orders a listing with a package", () => asCompany(async () => {
        const listing = await seedListing();
        const pkg = await seedPackage(listing, 180);

        const res = await post("/api/marketplace/order/createFromListing", {listing: listing.toString(), package: pkg.toString()}, customer);
        expect(res.status).toBe(200);
        const order = await Order.findById(res.body._id);
        expect(order).toMatchObject({amount: 180, status: "pending"});
        expect(order!.customer.toString()).toBe(customerId.toString());
    }));
});
