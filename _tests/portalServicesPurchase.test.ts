import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

// The job matching finds listed sellers by their module, whatever the local `.env` enables.
vi.hoisted(() => {
    process.env.ENABLED_MODULES = "core,finance,marketplace";
});
import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import request from "supertest";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);
// The task request form's images are uploaded before the route; here the request names an existing media id
vi.mock("@coreModule/utilities/middlewares/mediaUploadMW", () => ({
    mediaUploadMW: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import Company from "@coreModule/database/schemas/company/company";
import Currency from "@coreModule/database/schemas/currency/currency";
import Country from "@coreModule/database/schemas/country/country";
import * as serviceOrderRoute from "@marketplaceModule/api/marketplace/private/order";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import ListingPackage from "@marketplaceModule/database/schemas/listingPackage/listingPackage";
import Order from "@marketplaceModule/database/schemas/order/order";
import Review from "@marketplaceModule/database/schemas/review/review";
import Dispute from "@marketplaceModule/database/schemas/dispute/dispute";
import Booking from "@marketplaceModule/database/schemas/booking/booking";
import * as reviewRoute from "@marketplaceModule/api/marketplace/private/review";
import * as disputeRoute from "@marketplaceModule/api/marketplace/private/dispute";
import * as bookingRoute from "@marketplaceModule/api/marketplace/private/booking";
import * as taskRequestRoute from "@marketplaceModule/api/marketplace/private/taskRequest";
import ListingCategory from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import MarketplaceConfig from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";
import TaskRequest from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import TaskLead from "@marketplaceModule/database/schemas/taskLead/taskLead";
import City from "@coreModule/database/schemas/city/city";
import Media from "@coreModule/database/schemas/media/media";
import {appFor, callerHeader} from "@coreModule/_tests/httpHarness";
import {asCrossTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {PORTAL_ROOT_DOMAIN} from "@coreModule/environment";

// The portal apex buys every listed provider company's services (D16: the marketplace is an explicit opt-out).
const app = appFor([serviceOrderRoute, reviewRoute, disputeRoute, bookingRoute, taskRequestRoute].map((route) => ({...route, module: "marketplace"})));

const platform = new ObjectId();
const sellerA = new ObjectId();
const buyer = new ObjectId();
const apex = `http://${PORTAL_ROOT_DOMAIN}:5212`;
const shopper = callerHeader({userId: buyer.toString(), companyId: platform.toString()});
/** Countries are rows per company: the platform's own Albania, which a portal address names. */
let platformAlbania: ObjectId;

beforeAll(async () => {
    await connectTestDatabase();
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => asCrossTenant("test setup", async () => {
    for (const collection of await mongoose.connection.db!.collections()) {
        await collection.deleteMany({});
    }
}));

/** A provider company with the marketplace and its own currency row (EUR); returns that currency. */
async function seedSeller(company: ObjectId, name: string) {
    await Company.collection.insertOne({_id: company, name, vat: `VAT-${name}`, isActive: true, modules: ["marketplace"], deletedAt: null});
    return withTenant(company, async () => ({currencyRow: (await new Currency({name: "Euro", symbol: "€", decimalPlaces: 2, abbreviation: "EUR", company}).save())._id}));
}

const call = (method: "put" | "post" | "get", path: string, body?: Record<string, unknown>, origin = apex) =>
    request(app)[method](path).set({...shopper, Origin: origin}).send(body);

describe("portal services purchase (D16, D142)", () => {
    beforeEach(async () => {
        await Company.collection.insertOne({_id: platform, name: "Platform", vat: "VAT-Platform", isActive: true, modules: ["marketplace"], isPlatformOwner: true, deletedAt: null});
        platformAlbania = (await withTenant(platform, () => new Country({name: "Albania", code: "AL", phoneCode: "355", company: platform}).save()))._id;
    });

    // TD-B91: the services marketplace orders a listing from its seller and shows the buyer their orders from every seller.
    it("orders another seller's service listing from the apex and lists it on the buyer's pages", async () => {
        const seller = await seedSeller(sellerA, "Alpha");
        const provider = new ObjectId();
        const listing = await asCrossTenant("test setup", async () => {
            const {insertedId} = await Listing.collection.insertOne({
                name: "LIST-1", title: "Wall painting", category: new ObjectId(), provider, price: 100, priceCurrency: seller.currencyRow,
                pricingType: "fixed", deliveryDays: 3, status: "active", mainImage: new ObjectId(), listingPackages: [], company: sellerA, createdAt: new Date(),
            });
            const pkg = await ListingPackage.collection.insertOne({
                listing: insertedId, provider, name: "Pack", price: {amount: 150, currency: seller.currencyRow}, deliveryDays: 5, order: 0, company: sellerA,
            });
            return {listing: insertedId, pkg: pkg.insertedId};
        });

        const created = await call("post", "/api/marketplace/order/createFromListing", {listing: listing.listing.toString(), package: listing.pkg.toString()});
        const mine = await call("post", "/api/marketplace/order/my", {});
        const single = await call("post", "/api/marketplace/order/mySingle", {_id: created.body._id});

        expect([created.status, created.body.error_code]).toEqual([200, undefined]);
        const order = (await asCrossTenant("test assertions", () => Order.findById(created.body._id)))!;
        expect([String(order.company), order.amount]).toEqual([sellerA.toString(), 150]);
        expect([mine.status, mine.body.total, single.status]).toEqual([200, 1, 200]);
    });

    /** A services order of seller A that the shopper bought on the portal, in `status`. */
    async function seedServiceOrder(status: string) {
        const provider = new ObjectId();
        return asCrossTenant("test setup", async () => (await Order.collection.insertOne({
            name: `ORD-${new ObjectId().toString()}`, listing: new ObjectId(), customer: buyer, provider, amount: 100,
            currency: new ObjectId(), status, company: sellerA, createdAt: new Date(),
        })).insertedId);
    }
    const storedOrder = (_id: ObjectId) => asCrossTenant("test assertions", () => Order.findById(_id));

    // TD-B93: the buyer's own actions on a services order of another seller, from the apex.
    it("lets the buyer cancel, review and dispute their own services order of another seller from the apex", async () => {
        await seedSeller(sellerA, "Alpha");
        const pending = await seedServiceOrder("pending");
        const completed = await seedServiceOrder("completed");
        const active = await seedServiceOrder("in_progress");

        const cancelled = await call("post", "/api/marketplace/order/cancel", {_id: pending.toString()});
        const reviewed = await call("put", "/api/marketplace/review/createMine", {order: completed.toString(), rating: 5, comment: "Great"});
        const disputed = await call("put", "/api/marketplace/dispute/createMine", {order: active.toString(), reason: "Late"});

        expect([cancelled.status, cancelled.body.error_code]).toEqual([200, undefined]);
        expect([reviewed.status, reviewed.body.error_code]).toEqual([200, undefined]);
        expect([disputed.status, disputed.body.error_code]).toEqual([200, undefined]);
        expect((await storedOrder(pending))!.status).toBe("cancelled");
        await asCrossTenant("test assertions", async () => {
            expect(String((await Review.findOne({order: completed}))!.company)).toBe(sellerA.toString());
            expect(String((await Dispute.findOne({order: active}))!.company)).toBe(sellerA.toString());
        });
    });

    // TD-B94: the buyer books a session on their own services order of another seller, from the apex.
    it("lets the buyer book on their own active services order of another seller from the apex", async () => {
        await seedSeller(sellerA, "Alpha");
        const accepted = await seedServiceOrder("accepted");
        const slot = {startAt: "2026-12-01T09:00:00.000Z", endAt: "2026-12-01T10:00:00.000Z", timezone: "Europe/Tirane"};

        const booked = await call("put", "/api/marketplace/booking/createMine", {order: accepted.toString(), ...slot});

        expect([booked.status, booked.body.error_code]).toEqual([200, undefined]);
        const booking = (await asCrossTenant("test assertions", () => Booking.findOne({order: accepted})))!;
        const order = (await storedOrder(accepted))!;
        expect([String(booking.company), String(booking.provider), booking.startAt.toISOString(), booking.timezone])
            .toEqual([sellerA.toString(), String(order.provider), slot.startAt, "Europe/Tirane"]);
    });

    it("refuses a booking on another buyer's order, on an order not yet accepted, and for an invalid slot", async () => {
        await seedSeller(sellerA, "Alpha");
        const accepted = await seedServiceOrder("accepted");
        const pending = await seedServiceOrder("pending");
        const slot = {startAt: "2026-12-01T09:00:00.000Z", endAt: "2026-12-01T10:00:00.000Z"};
        const stranger = callerHeader({userId: new ObjectId().toString(), companyId: platform.toString()});

        const notMine = await request(app).put("/api/marketplace/booking/createMine")
            .set({...stranger, Origin: apex}).send({order: accepted.toString(), ...slot});
        const notActive = await call("put", "/api/marketplace/booking/createMine", {order: pending.toString(), ...slot});
        const backwards = await call("put", "/api/marketplace/booking/createMine", {order: accepted.toString(), startAt: slot.endAt, endAt: slot.startAt});

        expect([notMine.status, notMine.body.error_code]).toEqual([400, "order_not_found"]);
        expect([notActive.status, notActive.body.error_code]).toEqual([400, "booking_order_not_active"]);
        expect(backwards.status).toBe(400);
        expect(await asCrossTenant("test assertions", () => Booking.countDocuments({}))).toBe(0);
    });

    it("keeps seller-side actions and other buyers' orders inside the request's company", async () => {
        await seedSeller(sellerA, "Alpha");
        const pending = await seedServiceOrder("pending");
        await asCrossTenant("test setup", () => Order.collection.updateOne({_id: pending}, {$set: {customer: new ObjectId()}}));

        const accepted = await call("post", "/api/marketplace/order/accept", {_id: pending.toString()});
        const cancelled = await call("post", "/api/marketplace/order/cancel", {_id: pending.toString()});

        expect(accepted.status).not.toBe(200);
        expect(cancelled.body.error_code).toBe("order_not_found");
        expect((await storedOrder(pending))!.status).toBe("pending");
    });

    // D143: a portal buyer's job lives in the marketplace operator, in the operator's own currency, places and shared
    // photo, and reaches the listed sellers whose area holds its pin.
    it("posts the buyer's job from the apex into the operator, reaches the seller, then lists and opens it", async () => {
        const operator = new ObjectId();
        await seedSeller(sellerA, "Alpha");
        const seller = sellerA;
        const ids = await asCrossTenant("test setup", async () => {
            await Company.collection.insertOne({_id: operator, name: "Operator", vat: "VAT-Operator", isActive: true, modules: ["marketplace"], deletedAt: null});
            const opEuro = (await Currency.collection.insertOne({name: "Euro", symbol: "€", decimalPlaces: 2, abbreviation: "EUR", company: operator})).insertedId;
            await MarketplaceConfig.collection.insertOne({company: operator, currency: opEuro, isOperator: true, listedOnPortal: false, deletedAt: null});
            await MarketplaceConfig.collection.insertOne({company: seller, currency: new ObjectId(), listedOnPortal: true, deletedAt: null});
            const opAlbania = (await Country.collection.insertOne({name: "Albania", code: "AL", company: operator})).insertedId;
            const opTirana = (await City.collection.insertOne({name: "Tirana", country: opAlbania, company: operator})).insertedId;
            const euro = (await Currency.collection.insertOne({name: "Euro", symbol: "€", decimalPlaces: 2, abbreviation: "EUR", company: platform})).insertedId;
            const tirana = (await City.collection.insertOne({name: "Tirana", country: platformAlbania, company: platform})).insertedId;
            const category = (await ListingCategory.collection.insertOne({name: "Painting", slug: "painting", delivery: "onsite", order: 0, company: operator, deletedAt: null})).insertedId;
            const photo = (await Media.collection.insertOne({company: platform, createdBy: buyer, deletedAt: null})).insertedId;
            const painter = new ObjectId();
            await Listing.collection.insertOne({
                company: seller, provider: painter, category, title: "Painting", status: "active", avgRating: 4, deletedAt: null,
                serviceArea: {latitude: 41.3, longitude: 19.8, radiusKm: 10}, serviceAreaPoint: {type: "Point", coordinates: [19.8, 41.3]},
            });
            return {opEuro, opAlbania, opTirana, euro, tirana, category, photo, painter};
        });

        const created = await call("put", "/api/marketplace/taskRequest/createMine", {
            title: "Paint my flat", category: ids.category.toString(), budgetMin: 100, budgetMax: 300, currency: ids.euro.toString(),
            mainImage: ids.photo.toString(),
            address: {street: "Rruga 1", postalCode: "1001", country: platformAlbania.toString(), city: ids.tirana.toString(), latitude: 41.3, longitude: 19.81},
        });
        expect([created.status, created.body.error_code, created.body.data?.notified]).toEqual([200, undefined, 1]);

        const job = (await asCrossTenant("test assertions", () => TaskRequest.collection.findOne({_id: new ObjectId(created.body.data._id)})))!;
        expect([job.company, job.currency, job.address.country, job.address.city].map(String))
            .toEqual([operator, ids.opEuro, ids.opAlbania, ids.opTirana].map(String));
        const lead = await asCrossTenant("test assertions", () => TaskLead.collection.findOne({taskRequest: job._id}));
        expect([String(lead?.company), String(lead?.provider)]).toEqual([String(seller), String(ids.painter)]);
        const photo = await asCrossTenant("test assertions", () => Media.collection.findOne({_id: ids.photo}));
        expect(photo?.sharedWithCompanies.map(String).sort()).toEqual([operator, seller].map(String).sort());

        const mine = await call("post", "/api/marketplace/taskRequest/my", {});
        const single = await call("post", "/api/marketplace/taskRequest/mySingle", {_id: created.body.data._id});
        expect([mine.status, mine.body.total, single.status]).toEqual([200, 1, 200]);
    });
});
