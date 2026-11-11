import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

import {ObjectId} from "mongodb";
import request from "supertest";

vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);
vi.mock("@coreModule/utilities/middlewares/rateLimiter", () => ({
    rateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import {allPermissionTags, appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import {withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import User from "@coreModule/database/schemas/user/user";
import * as listingRoute from "@marketplaceModule/api/marketplace/private/listing";
import * as providerProfileRoute from "@marketplaceModule/api/marketplace/private/providerProfile";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import ListingFlag from "@marketplaceModule/database/schemas/listingFlag/listingFlag";
import Order from "@marketplaceModule/database/schemas/order/order";
import Booking from "@marketplaceModule/database/schemas/booking/booking";
import Review from "@marketplaceModule/database/schemas/review/review";
import Bid from "@marketplaceModule/database/schemas/bid/bid";
import ProviderProfile from "@marketplaceModule/database/schemas/providerProfile/providerProfile";

const companyId = new ObjectId();
const asCompany = <T>(fn: () => PromiseLike<T>): Promise<T> => withTenant(companyId, fn);
const app = appFor([listingRoute, providerProfileRoute].map((route) => ({...route, module: "marketplace"})));
const single = (caller: TestCaller, path: string, _id: ObjectId) =>
    request(app).post(`${path}/single`).set(callerHeader(caller)).send({_id: _id.toString()});

const providerId = new ObjectId();
const customerId = new ObjectId();
const otherCustomerId = new ObjectId();
const currencyId = new ObjectId();
const marketplaceModels = [Listing, Order, Booking, Review, ListingFlag, Bid, ProviderProfile];

let marketplaceAdmin: TestCaller;
let marketplaceCustomer: TestCaller;
let listingsOnly: TestCaller;

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all(marketplaceModels.map((model) => model.init()));
    const caller = (userId: ObjectId, permissions: string[], isAdmin = false): TestCaller =>
        ({userId: userId.toString(), companyId: companyId.toString(), isAdmin, permissions, modules: ["core", "marketplace"]});
    marketplaceAdmin = caller(new ObjectId(), allPermissionTags(marketplaceModels), true);
    // Not an admin: the orders, bookings and reports routes show such a caller only their own (marketplaceAccess).
    marketplaceCustomer = caller(customerId, allPermissionTags(marketplaceModels));
    listingsOnly = caller(new ObjectId(), allPermissionTags([Listing, ProviderProfile]));
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => asCompany(async () => {
    await Promise.all([User, ...marketplaceModels].map((model) => model.collection.deleteMany({})));
    await User.collection.insertMany([
        {_id: providerId, username: "pat", name: "Pat", surname: "Painter", email: "pat@provider.test", companies: [companyId]},
        {_id: customerId, username: "cam", name: "Cam", surname: "Customer", email: "cam@customer.test", companies: [companyId]},
        {_id: otherCustomerId, username: "oli", name: "Oli", surname: "Other", email: "oli@customer.test", companies: [companyId]},
    ]);
}));

async function listing(title: string): Promise<ObjectId> {
    const {insertedId} = await Listing.collection.insertOne({
        name: `LIST-${new ObjectId().toString()}`, title, category: new ObjectId(), provider: providerId, price: 100, priceCurrency: currencyId,
        pricingType: "fixed", deliveryDays: 3, status: "active", company: companyId, createdAt: new Date(),
    });
    return insertedId;
}

async function order(listingId: ObjectId | undefined, customer: ObjectId, name: string, createdAt: string): Promise<ObjectId> {
    const {insertedId} = await Order.collection.insertOne({
        name, ...(listingId && {listing: listingId}), customer, provider: providerId, amount: 100, currency: currencyId, status: "completed",
        company: companyId, createdAt: new Date(createdAt),
    });
    return insertedId;
}

describe("marketplace sheets as hubs (P10.7)", () => {
    it("lists a listing's orders, bookings, reviews and reports with each list's own record filter", () => asCompany(async () => {
        const painting = await listing("Wall painting");
        const other = await listing("Garden work");
        const mine = await order(painting, customerId, "ORD-MINE", "2026-11-01T09:00:00Z");
        const theirs = await order(painting, otherCustomerId, "ORD-THEIRS", "2026-11-03T09:00:00Z");
        await order(other, customerId, "ORD-ELSEWHERE", "2026-11-04T09:00:00Z");
        await Booking.collection.insertMany([
            {order: mine, provider: providerId, startAt: new Date("2026-11-10T09:00:00Z"), endAt: new Date("2026-11-10T11:00:00Z"), timezone: "Europe/Tirane", company: companyId},
            {order: theirs, provider: providerId, startAt: new Date("2026-11-12T09:00:00Z"), endAt: new Date("2026-11-12T11:00:00Z"), timezone: "Europe/Tirane", company: companyId},
        ]);
        await Review.collection.insertOne({order: mine, listing: painting, rating: 5, comment: "Great", reviewer: customerId, company: companyId, createdAt: new Date()});
        await ListingFlag.collection.insertMany([
            {listing: painting, user: customerId, reason: "spam", status: "pending", company: companyId, createdAt: new Date("2026-11-02T09:00:00Z")},
            {listing: painting, user: otherCustomerId, reason: "misleading", status: "pending", company: companyId, createdAt: new Date("2026-11-03T09:00:00Z")},
        ]);

        const admin = await single(marketplaceAdmin, "/api/marketplace/listing", painting);
        expect(admin.status).toBe(200);
        expect(admin.body.orders.map((row: {name: string}) => row.name)).toEqual(["ORD-THEIRS", "ORD-MINE"]);
        expect(admin.body.bookings).toHaveLength(2);
        expect(admin.body.reviews.map((row: {comment: string}) => row.comment)).toEqual(["Great"]);
        expect(admin.body.flags.map((row: {reason: string}) => row.reason)).toEqual(["misleading", "spam"]);

        // A non-admin sees the orders they are a party to, those orders' bookings, and their own report.
        const party = await single(marketplaceCustomer, "/api/marketplace/listing", painting);
        expect(party.status).toBe(200);
        expect(party.body.orders.map((row: {name: string}) => row.name)).toEqual(["ORD-MINE"]);
        expect(party.body.bookings).toHaveLength(1);
        expect(party.body.reviews).toHaveLength(1);
        expect(party.body.flags.map((row: {reason: string}) => row.reason)).toEqual(["spam"]);

        const limited = await single(listingsOnly, "/api/marketplace/listing", painting);
        expect(limited.status).toBe(200);
        expect(limited.body.title).toBe("Wall painting");
        for (const key of ["orders", "bookings", "reviews"]) expect(limited.body).not.toHaveProperty(key);
        // Anyone may report a listing (the model's fields are public-read), so the list is there, holding only their own reports.
        expect(limited.body.flags).toEqual([]);
    }));

    it("lists a provider's listings, orders, bids and reviews, and leaves out what the role may not read", () => asCompany(async () => {
        const painting = await listing("Wall painting");
        const done = await order(painting, customerId, "ORD-DONE", "2026-11-01T09:00:00Z");
        await Review.collection.insertOne({order: done, listing: painting, rating: 4, comment: "Tidy", reviewer: customerId, company: companyId, createdAt: new Date()});
        await Bid.collection.insertOne({
            name: "BID-1", taskRequest: new ObjectId(), bidder: providerId, amount: 80, currency: currencyId, proposal: "Two coats",
            deliveryDays: 2, status: "pending", company: companyId, createdAt: new Date(),
        });
        const {insertedId: profile} = await ProviderProfile.collection.insertOne({user: providerId, skills: ["painting"], company: companyId, createdAt: new Date()});

        const admin = await single(marketplaceAdmin, "/api/marketplace/providerProfile", profile);
        expect(admin.status).toBe(200);
        expect(admin.body.listings.map((row: {title: string}) => row.title)).toEqual(["Wall painting"]);
        expect(admin.body.orders.map((row: {name: string}) => row.name)).toEqual(["ORD-DONE"]);
        expect(admin.body.bids.map((row: {name: string}) => row.name)).toEqual(["BID-1"]);
        expect(admin.body.reviews.map((row: {comment: string}) => row.comment)).toEqual(["Tidy"]);

        const limited = await single(listingsOnly, "/api/marketplace/providerProfile", profile);
        expect(limited.status).toBe(200);
        expect(limited.body.listings.map((row: {title: string}) => row.title)).toEqual(["Wall painting"]);
        for (const key of ["orders", "bids", "reviews"]) expect(limited.body).not.toHaveProperty(key);
    }));
});
