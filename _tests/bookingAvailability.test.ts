import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import request from "supertest";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);

import Company from "@coreModule/database/schemas/company/company";
import User from "@coreModule/database/schemas/user/user";
import Order from "@marketplaceModule/database/schemas/order/order";
import Booking from "@marketplaceModule/database/schemas/booking/booking";
import ProviderProfile from "@marketplaceModule/database/schemas/providerProfile/providerProfile";
import * as bookingRoute from "@marketplaceModule/api/marketplace/private/booking";
import * as serviceOrderRoute from "@marketplaceModule/api/marketplace/private/order";
import * as providerProfileRoute from "@marketplaceModule/api/marketplace/private/providerProfile";
import {allPermissionTags, appFor, callerHeader} from "@coreModule/_tests/httpHarness";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {PORTAL_ROOT_DOMAIN} from "@coreModule/environment";

// D105 / TD-B106: a booking falls fully inside one of the provider's weekly windows, in the provider's zone.
const app = appFor([bookingRoute, serviceOrderRoute, providerProfileRoute].map((route) => ({...route, module: "marketplace"})));

const platform = new ObjectId();
const seller = new ObjectId();
const provider = new ObjectId();
const buyer = new ObjectId();
const apex = `http://${PORTAL_ROOT_DOMAIN}:5212`;
const staff = callerHeader({
    userId: provider.toString(),
    companyId: seller.toString(),
    permissions: allPermissionTags([Booking, ProviderProfile]),
});
const shopper = callerHeader({userId: buyer.toString(), companyId: platform.toString()});

const MONDAY_9_TO_5 = [{dayOfWeek: 1, startTime: "09:00", endTime: "17:00"}];

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
    await Company.collection.insertMany([
        {_id: platform, name: "Platform", vat: "VAT-P", isActive: true, modules: ["marketplace"], isPlatformOwner: true, deletedAt: null},
        {_id: seller, name: "Seller", vat: "VAT-S", isActive: true, modules: ["marketplace"], timezone: "Europe/Zurich", deletedAt: null},
    ]);
}));

async function seedProfile(availability: {dayOfWeek: number; startTime: string; endTime: string}[], timezone?: string) {
    await asCrossTenant("test setup", () => ProviderProfile.collection.insertOne({
        user: provider, company: seller, availability, ...(timezone && {timezone}), skills: [], portfolio: [], deletedAt: null,
    }));
}

/** An accepted services order of the seller: the buyer bought it from the provider. */
async function seedOrder() {
    return asCrossTenant("test setup", async () => (await Order.collection.insertOne({
        name: `ORD-${new ObjectId().toString()}`, listing: new ObjectId(), customer: buyer, provider, amount: 100,
        currency: new ObjectId(), status: "accepted", company: seller, createdAt: new Date(),
    })).insertedId.toString());
}

/** Books `[startAt, endAt)` on a fresh order, as the provider in the panel or as the buyer on the portal. */
async function book(via: "panel" | "portal", startAt: string, endAt: string) {
    const body = {order: await seedOrder(), startAt, endAt, timezone: "Europe/Tirane"};
    return via === "panel"
        ? request(app).put("/api/marketplace/booking").set(staff).send(body)
        : request(app).put("/api/marketplace/booking/createMine").set({...shopper, Origin: apex}).send(body);
}

const bookingCount = () => asCrossTenant("test assertions", () => Booking.countDocuments({}));

describe.each(["panel", "portal"] as const)("booking inside the provider's availability (%s)", (via) => {
    it("books a slot inside a window", async () => {
        await seedProfile(MONDAY_9_TO_5, "Europe/Zurich");

        // Monday 7 Dec 2026, 10:00–11:00 in Zurich (CET, UTC+1)
        const booked = await book(via, "2026-12-07T09:00:00.000Z", "2026-12-07T10:00:00.000Z");

        expect([booked.status, booked.body.error_code]).toEqual([200, undefined]);
        expect(await bookingCount()).toBe(1);
    });

    it("refuses a slot that leaves the window, or falls on another day", async () => {
        await seedProfile(MONDAY_9_TO_5, "Europe/Zurich");

        const overruns = await book(via, "2026-12-07T15:30:00.000Z", "2026-12-07T16:30:00.000Z");
        const tuesday = await book(via, "2026-12-08T09:00:00.000Z", "2026-12-08T10:00:00.000Z");

        expect([overruns.status, overruns.body.error_code]).toEqual([400, "booking_outside_provider_availability"]);
        expect(overruns.body.message).toContain("Europe/Zurich");
        expect(tuesday.body.error_code).toBe("booking_outside_provider_availability");
        expect(await bookingCount()).toBe(0);
    });

    it("books any time when the provider has no windows, or no profile", async () => {
        const noProfile = await book(via, "2026-12-08T02:00:00.000Z", "2026-12-08T03:00:00.000Z");
        await seedProfile([], "Europe/Zurich");
        const emptyWindows = await book(via, "2026-12-09T02:00:00.000Z", "2026-12-09T03:00:00.000Z");

        expect([noProfile.status, emptyWindows.status]).toEqual([200, 200]);
        expect(await bookingCount()).toBe(2);
    });
});

describe("availability windows in time (D105)", () => {
    it("follows the wall clock across the spring DST change", async () => {
        await seedProfile(MONDAY_9_TO_5, "Europe/Zurich");

        // Clocks go forward on Sunday 28 Mar 2027: 09:00 is 08:00Z the Monday before and 07:00Z the Monday after
        const beforeChange = await book("panel", "2027-03-22T08:00:00.000Z", "2027-03-22T09:00:00.000Z");
        const afterChange = await book("panel", "2027-03-29T07:00:00.000Z", "2027-03-29T08:00:00.000Z");
        const lateAfterChange = await book("panel", "2027-03-29T15:30:00.000Z", "2027-03-29T16:00:00.000Z");

        expect([beforeChange.status, afterChange.status]).toEqual([200, 200]);
        expect(lateAfterChange.body.error_code).toBe("booking_outside_provider_availability");
    });

    it("books past midnight only when one window ends at 24:00 and the next day's starts at 00:00", async () => {
        await seedProfile([{dayOfWeek: 5, startTime: "22:00", endTime: "24:00"}], "Europe/Zurich");
        // Friday 11 Dec 2026, 23:00 to Saturday 00:30 in Zurich
        const slot = ["2026-12-11T22:00:00.000Z", "2026-12-11T23:30:00.000Z"] as const;

        const oneWindow = await book("panel", ...slot);
        await asCrossTenant("test setup", () => ProviderProfile.collection.updateOne(
            {user: provider},
            {$push: {availability: {dayOfWeek: 6, startTime: "00:00", endTime: "02:00"}}} as never,
        ));
        const spanning = await book("panel", ...slot);

        expect(oneWindow.body.error_code).toBe("booking_outside_provider_availability");
        expect([spanning.status, spanning.body.error_code]).toEqual([200, undefined]);
    });

    it("uses the company's time zone when the profile names none, and shows it to the buyer", async () => {
        await asCrossTenant("test setup", () => Company.collection.updateOne({_id: seller}, {$set: {timezone: "Asia/Tokyo"}}));
        await seedProfile(MONDAY_9_TO_5);

        // Monday 09:00–10:00 in Tokyo is 00:00Z; 09:00Z is 18:00 there
        const tokyoMorning = await book("portal", "2026-12-07T00:00:00.000Z", "2026-12-07T01:00:00.000Z");
        const utcMorning = await book("portal", "2026-12-07T09:00:00.000Z", "2026-12-07T10:00:00.000Z");
        await asCrossTenant("test setup", () => User.collection.insertOne({_id: provider, name: "Ana", surname: "Provider", email: "provider@example.com"}));
        const order = await seedOrder();
        const single = await request(app).post("/api/marketplace/order/mySingle").set({...shopper, Origin: apex}).send({_id: order});

        expect([tokyoMorning.status, tokyoMorning.body.error_code]).toEqual([200, undefined]);
        expect(utcMorning.body.error_code).toBe("booking_outside_provider_availability");
        expect(utcMorning.body.message).toContain("Asia/Tokyo");
        expect(single.body.data.providerAvailability).toEqual({timeZone: "Asia/Tokyo", windows: MONDAY_9_TO_5});
    });
});

describe("provider profile schedule", () => {
    const save = (body: Record<string, unknown>) =>
        request(app).put("/api/marketplace/providerProfile").set(staff).send(body);

    it("refuses an unknown time zone and a window that ends before it starts", async () => {
        const badZone = await save({timezone: "Mars/Olympus", availability: MONDAY_9_TO_5});
        const backwards = await save({timezone: "Europe/Zurich", availability: [{dayOfWeek: 1, startTime: "17:00", endTime: "09:00"}]});

        expect([badZone.status, badZone.body.error_code]).toEqual([400, "provider_invalid_timezone"]);
        expect(backwards.body.error_code).toBe("provider_availability_end_before_start");
    });

    it("stores the provider's time zone", async () => {
        await asCrossTenant("test setup", () => User.collection.insertOne({_id: provider, name: "Ana", surname: "Provider", email: "provider@example.com"}));
        const saved = await save({timezone: "Europe/Zurich", availability: MONDAY_9_TO_5});

        expect([saved.status, saved.body.error_code]).toEqual([200, undefined]);
        const profile = await asCrossTenant("test assertions", () => ProviderProfile.findOne({user: provider}));
        expect(profile!.timezone).toBe("Europe/Zurich");
        const single = await request(app).post("/api/marketplace/providerProfile/single").set(staff).send({_id: profile!._id.toString()});
        expect(single.body.timezone).toBe("Europe/Zurich");
    });
});
