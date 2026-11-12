import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

// Provider companies are found by their module, whatever the local `.env` enables.
vi.hoisted(() => {
    process.env.ENABLED_MODULES = "core,finance,marketplace";
});
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import {asCrossTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {getLogger} from "@coreModule/loggers/serverLog";
import Company from "@coreModule/database/schemas/company/company";
import Media from "@coreModule/database/schemas/media/media";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import ListingCategory from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import MarketplaceConfig from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";
import TaskLead from "@marketplaceModule/database/schemas/taskLead/taskLead";
import type {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import {createJobLeads, findJobMatches} from "@marketplaceModule/utilities/services/jobMatching";

const operator = new ObjectId();
const durresFix = new ObjectId();
const tiranaPros = new ObjectId();
const notListed = new ObjectId();
const buyer = new ObjectId();
const [durresPlumber, tiranaPlumber, designer, hiddenPlumber] = [new ObjectId(), new ObjectId(), new ObjectId(), new ObjectId()];
const categories = {home: new ObjectId(), plumbing: new ObjectId(), leaks: new ObjectId(), design: new ObjectId()};
const DURRES = {latitude: 41.3231, longitude: 19.4414};
const TIRANA = {latitude: 41.3275, longitude: 19.8187};
const fixtures = <T>(fn: () => PromiseLike<T>): Promise<T> => asCrossTenant("test fixtures span companies", fn);
const ctx = {logger: getLogger("test"), languageCode: "en-US"};

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([Listing.init(), TaskLead.init(), MarketplaceConfig.init()]);
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => fixtures(async () => {
    for (const collection of await mongoose.connection.db!.collections()) await collection.deleteMany({});
    const company = (_id: ObjectId, name: string) => ({_id, name, vat: `VAT-${name}`, isActive: true, modules: ["core", "finance", "marketplace"], deletedAt: null});
    await Company.collection.insertMany([company(operator, "Operator"), company(durresFix, "Durres Fix"), company(tiranaPros, "Tirana Pros"), company(notListed, "Quiet")]);
    const config = (owner: ObjectId, listedOnPortal: boolean, isOperator = false) => ({company: owner, currency: new ObjectId(), listedOnPortal, isOperator, deletedAt: null});
    await MarketplaceConfig.collection.insertMany([config(operator, false, true), config(durresFix, true), config(tiranaPros, true), config(notListed, false)]);
    const category = (_id: ObjectId, slug: string, delivery: string, parent?: ObjectId) =>
        ({_id, name: slug, slug, delivery, order: 0, company: operator, deletedAt: null, ...(parent ? {parentListingCategory: parent} : {})});
    await ListingCategory.collection.insertMany([
        category(categories.home, "home", "onsite"),
        category(categories.plumbing, "plumbing", "onsite", categories.home),
        category(categories.leaks, "leaks", "onsite", categories.plumbing),
        category(categories.design, "design", "remote"),
    ]);
    const listing = (company: ObjectId, provider: ObjectId, category: ObjectId, rating: number, area?: {latitude: number; longitude: number; radiusKm: number}) => ({
        company, provider, category, title: "Service", status: "active", avgRating: rating, deletedAt: null, createdAt: new Date(),
        ...(area ? {serviceArea: area, serviceAreaPoint: {type: "Point", coordinates: [area.longitude, area.latitude]}} : {}),
    });
    await Listing.collection.insertMany([
        // A general plumber covers every plumbing sub-category, 30 km around Durrës.
        listing(durresFix, durresPlumber, categories.plumbing, 4.5, {...DURRES, radiusKm: 30}),
        // A leak specialist 20 km around Tirana, with a second listing (one lead per provider).
        listing(tiranaPros, tiranaPlumber, categories.leaks, 4.8, {...TIRANA, radiusKm: 20}),
        listing(tiranaPros, tiranaPlumber, categories.leaks, 4.0, {...TIRANA, radiusKm: 25}),
        listing(tiranaPros, designer, categories.design, 5),
        // Not listed on the portal, and the buyer's own listing: never reached from the apex.
        listing(notListed, hiddenPlumber, categories.leaks, 5, {...TIRANA, radiusKm: 50}),
        listing(tiranaPros, buyer, categories.leaks, 5, {...TIRANA, radiusKm: 50}),
    ]);
}));

function job(fields: Partial<Record<string, unknown>> = {}): ITaskRequest {
    return {_id: new ObjectId(), title: "Leaking tap", company: operator, requester: buyer, category: categories.leaks, address: {...TIRANA}, ...fields} as unknown as ITaskRequest;
}
const providers = (matches: {provider: ObjectId}[]) => matches.map((match) => match.provider.toString());

describe("job matching (D143)", () => {
    it("reaches on-site providers whose area holds the pin, through the category tree, one lead each", async () => {
        const inTirana = await findJobMatches(job({address: {...TIRANA}}));
        expect(providers(inTirana)).toEqual([tiranaPlumber.toString()]);
        expect(inTirana[0]).toMatchObject({company: tiranaPros, distanceKm: 0});

        // Durrës is about 32 km from Tirana: inside the Durrës plumber's 30 km, outside the Tirana areas.
        const inDurres = await findJobMatches(job({address: {...DURRES}}));
        expect(providers(inDurres)).toEqual([durresPlumber.toString()]);

        // A job in a parent category reaches the leak specialist too (19.80°E would already be within 30 km of Durrës).
        const nearTirana = await findJobMatches(job({category: categories.home, address: {...TIRANA}}));
        expect(providers(nearTirana)).toEqual([tiranaPlumber.toString()]);
    });

    it("reaches online providers anywhere, ranks by rating and stops at the cap", async () => {
        expect(providers(await findJobMatches(job({category: categories.design, address: undefined})))).toEqual([designer.toString()]);

        const both = job({category: categories.plumbing, address: {latitude: 41.3253, longitude: 19.63}});
        expect(providers(await findJobMatches(both))).toEqual([tiranaPlumber.toString(), durresPlumber.toString()]);
        expect(providers(await findJobMatches(both, 1))).toEqual([tiranaPlumber.toString()]);
    });

    it("keeps a job to the company it was posted on, or to its own company when made in the panel", async () => {
        const onDurresSite = job({category: categories.plumbing, address: {latitude: 41.3253, longitude: 19.63}, restrictedToCompany: durresFix});
        expect(providers(await findJobMatches(onDurresSite))).toEqual([durresPlumber.toString()]);

        const panelJob = job({company: notListed});
        expect(providers(await findJobMatches(panelJob))).toEqual([hiddenPlumber.toString()]);
    });

    it("gives each provider one lead in their own company, shares the photos and never doubles up", async () => {
        const photo = new ObjectId();
        await fixtures(() => Media.collection.insertOne({_id: photo, company: buyer, createdBy: buyer, sharedWithCompanies: [operator], deletedAt: null}));
        const posted = job({category: categories.plumbing, address: {latitude: 41.3253, longitude: 19.63}, mainImage: photo});

        expect(await withTenant(operator, () => createJobLeads(posted, ctx))).toBe(2);
        expect(await withTenant(operator, () => createJobLeads(posted, ctx))).toBe(0);

        const leads = await fixtures(() => TaskLead.collection.find({}).sort({company: 1}).toArray());
        expect(leads.map((lead) => [String(lead.company), String(lead.provider), String(lead.taskRequest), lead.status]).sort()).toEqual([
            [durresFix.toString(), durresPlumber.toString(), posted._id.toString(), "new"],
            [tiranaPros.toString(), tiranaPlumber.toString(), posted._id.toString(), "new"],
        ].sort());
        expect(leads.every((lead) => typeof lead.distanceKm === "number")).toBe(true);
        const shared = await fixtures(() => Media.collection.findOne({_id: photo}));
        expect(shared?.sharedWithCompanies.map(String).sort()).toEqual([operator, durresFix, tiranaPros].map(String).sort());
    });
});
