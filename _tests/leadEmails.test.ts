import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

vi.hoisted(() => {
    process.env.ENABLED_MODULES = "core,finance,marketplace";
});
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

const {sent} = vi.hoisted(() => ({sent: [] as {companyId: string; to: string; subject: string; html: string}[]}));
vi.mock("@coreModule/utilities/emails/mailDeliveryService", () => ({
    sendMail: vi.fn(async (companyId: string, mail: {to: string; subject: string; html: string}) => {
        sent.push({companyId, ...mail});
    }),
}));
vi.mock("@coreModule/environment", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@coreModule/environment")>();
    return {
        ...actual,
        EMAIL: {...actual.EMAIL, ENABLED: true},
        CLIENT_SIDE: {...actual.CLIENT_SIDE, NAME: "Arpeggio"},
        clientHostFor: () => "https://panel.example.test",
    };
});

import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import Company from "@coreModule/database/schemas/company/company";
import User from "@coreModule/database/schemas/user/user";
import City from "@coreModule/database/schemas/city/city";
import Currency from "@coreModule/database/schemas/currency/currency";
import ListingCategory from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import type {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import {emailNewLeads} from "@marketplaceModule/utilities/services/leadEmails";

const operator = new ObjectId();
const provider = new ObjectId();
const plumber = new ObjectId();
const quietPlumber = new ObjectId();
const fixtures = <T>(fn: () => PromiseLike<T>): Promise<T> => asCrossTenant("test fixtures span companies", fn);
let job: ITaskRequest;
let listing: ObjectId;

beforeAll(async () => {
    await connectTestDatabase();
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => fixtures(async () => {
    sent.length = 0;
    for (const collection of await mongoose.connection.db!.collections()) await collection.deleteMany({});
    await Company.collection.insertOne({_id: provider, name: "Adria Home Fix", vat: "VAT-1", isActive: true, modules: ["marketplace"], deletedAt: null});
    await User.collection.insertMany([
        {_id: plumber, username: "pat@fix.test", name: "Pat", surname: "Plumber", fullName: "Pat Plumber", preferredLanguage: "de-CH", companies: [provider], roles: [{company: provider, mutedNotifications: []}]},
        {_id: quietPlumber, username: "quiet@fix.test", name: "Quinn", companies: [provider], roles: [{company: provider, mutedNotifications: ["TASK_REQUEST_CREATED"]}]},
    ]);
    const category = (await ListingCategory.collection.insertOne({name: "Leaks & Taps", slug: "leaks", delivery: "onsite", order: 0, company: operator, deletedAt: null})).insertedId;
    const city = (await City.collection.insertOne({name: "Durrës", company: operator})).insertedId;
    const currency = (await Currency.collection.insertOne({name: "Euro", symbol: "€", abbreviation: "EUR", decimalPlaces: 2, company: operator})).insertedId;
    listing = (await Listing.collection.insertOne({title: "Leaking Tap Repairs", company: provider, provider: plumber, category, status: "active", deletedAt: null})).insertedId;
    job = {
        _id: new ObjectId(), title: "Kitchen tap drips", category, currency, budgetMin: 20, budgetMax: 60,
        address: {street: "Rruga Tregtare 5", postalCode: "2001", city, latitude: 41.32, longitude: 19.45}, company: operator,
    } as unknown as ITaskRequest;
}));

describe("new-lead emails (D145)", () => {
    it("tell the provider about the job in their language, with a button to the lead and nothing private", async () => {
        const lead = new ObjectId();
        await emailNewLeads(job, [{company: provider, provider: plumber, lead, listing, distanceKm: 0.7}]);

        expect(sent).toHaveLength(1);
        const [mail] = sent;
        expect([mail.companyId, mail.to]).toEqual([provider.toString(), "pat@fix.test"]);
        expect(mail.subject).toBe("Neuer Auftrag: Kitchen tap drips — Adria Home Fix");
        expect(mail.html).toContain(`https://panel.example.test/marketplace/leads?open=${lead.toString()}`);
        for (const shown of ["Kitchen tap drips", "Leaks &amp; Taps", "Durrës, 0.7 km", "20 – 60 EUR", "Leaking Tap Repairs"]) expect(mail.html).toContain(shown);
        for (const hidden of ["Rruga Tregtare", "2001", "41.32"]) expect(mail.html).not.toContain(hidden);
    });

    it("skip a provider who turned the notice off, under the same switch as the in-app notice", async () => {
        await emailNewLeads(job, [
            {company: provider, provider: quietPlumber, lead: new ObjectId(), listing},
            {company: provider, provider: plumber, lead: new ObjectId(), listing},
        ]);
        expect(sent.map((mail) => mail.to)).toEqual(["pat@fix.test"]);
    });
});
