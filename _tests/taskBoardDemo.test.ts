import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

// The demo's escrow ledger as it is seeded once card payments are on (D190 leaves them off until then).
vi.mock("armonia/src/modules/finance/helpers/cardPaymentAvailability", () => ({CARD_PAYMENTS_AVAILABLE: true}));

vi.hoisted(() => {
    process.env.ENABLED_MODULES = "core,finance,marketplace";
});
// No network in tests: each task's photo is a local media row of the company it is seeded for.
vi.mock("@coreModule/database/demo/demoMedia", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@coreModule/database/demo/demoMedia")>()),
    resolveDemoImagesFromUnsplash: async (ids: readonly string[], _key: unknown, _title: unknown, company: {_id: unknown}, createdBy: unknown) => {
        // Like the real one: an empty kit resolves to no photo.
        if (!ids.length) return {galleryIds: []};
        const {ObjectId: Id} = await import("mongodb");
        const {default: Media} = await import("@coreModule/database/schemas/media/media");
        const _id = new Id();
        await Media.collection.insertOne({_id, company: company._id, createdBy, deletedAt: null});
        return {mainImageId: _id, galleryIds: []};
    },
}));
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";
// Seeds run across companies, as the seed scripts run `createCompanies` (asCrossTenant).

import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {coreDemoCustomerSeeds} from "@coreModule/database/demo/demoSignupUsers";
import Company, {type ICompany} from "@coreModule/database/schemas/company/company";
import User from "@coreModule/database/schemas/user/user";
import Currency from "@coreModule/database/schemas/currency/currency";
import Country from "@coreModule/database/schemas/country/country";
import City from "@coreModule/database/schemas/city/city";
import EscrowTransaction from "@financeModule/database/schemas/escrowTransaction/escrowTransaction";
import TaskRequest from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import TaskLead from "@marketplaceModule/database/schemas/taskLead/taskLead";
import Bid from "@marketplaceModule/database/schemas/bid/bid";
import Order from "@marketplaceModule/database/schemas/order/order";
import OrderMilestone from "@marketplaceModule/database/schemas/orderMilestone/orderMilestone";
import Review from "@marketplaceModule/database/schemas/review/review";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import ListingCategory from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import MarketplaceConfig from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";
import {seedTaskBoardDemo} from "@marketplaceModule/database/demo/taskBoardDemo";
import {getLogger} from "@coreModule/loggers/serverLog";
import Media from "@coreModule/database/schemas/media/media";
import {createTaskRequests} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.defaults";
import {createBids} from "@marketplaceModule/database/schemas/bid/bid.defaults";
import {createOrders} from "@marketplaceModule/database/schemas/order/order.defaults";
import {getPortalProvider} from "@coreModule/domain/portal/portalProviderRegistry";
import {registerTasksPortalProvider} from "@marketplaceModule/domain/portal/tasksPortalProvider";

// The service categories and the portal's jobs are the platform company's (D196, D197).
const platform = new ObjectId();
const fix = new ObjectId();
const pros = new ObjectId();
const echo = new ObjectId();
const fixtures = <T>(fn: () => PromiseLike<T>): Promise<T> => asCrossTenant("test fixtures span companies", fn);
const DURRES = {latitude: 41.3231, longitude: 19.4414};

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([TaskLead.init(), Bid.init(), MarketplaceConfig.init(), Listing.init()]);
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => fixtures(async () => {
    for (const collection of await mongoose.connection.db!.collections()) await collection.deleteMany({});
    const company = (_id: ObjectId, name: string, vat: string, siteSlug: string) =>
        ({_id, name, vat, siteSlug, isActive: true, modules: ["core", "finance", "marketplace"], createdBy: echo, deletedAt: null});
    await Company.collection.insertMany([
        company(pros, "Tirana Pros", "Z523456789Z", "pros"), company(fix, "Adria Home Fix", "Z623456789Z", "fix"),
        {_id: platform, name: "Platform", vat: "VAT-Platform", isPlatformOwner: true, isActive: true, modules: ["core"], deletedAt: null},
    ]);
    await MarketplaceConfig.collection.insertMany([
        {company: pros, listedOnPortal: true, deletedAt: null},
        {company: fix, listedOnPortal: true, deletedAt: null},
    ]);
    await User.collection.insertMany([
        {_id: echo, username: "echo@echo.com", name: "Echo", surname: "Main"},
        ...coreDemoCustomerSeeds.map((seed) => ({username: seed.username, name: seed.name, surname: seed.surname})),
    ]);
    await Currency.collection.insertOne({name: "Euro", abbreviation: "EUR", symbol: "€", decimalPlaces: 2, deletedAt: null});
    const albania = (await Country.collection.insertOne({name: "Albania", code: "AL", deletedAt: null})).insertedId;
    await City.collection.insertOne({name: "Durrës", country: albania, deletedAt: null});
    const slugs = ["home-plumbing-leaks", "home-plumbing-drains", "home-plumbing-boilers", "home-electrical", "home-cleaning", "home-handyman"];
    const remote = ["design-logo-branding", "writing-translation-service"];
    const ids = new Map<string, ObjectId>();
    for (const slug of [...slugs, ...remote]) {
        const _id = new ObjectId();
        ids.set(slug, _id);
        await ListingCategory.collection.insertOne({_id, name: slug, slug, delivery: slugs.includes(slug) ? "onsite" : "remote", order: 0, company: platform, deletedAt: null});
    }
    // Adria Home Fix works around Durrës; Tirana Pros designs logos.
    await Listing.collection.insertMany([
        ...slugs.map((slug) => ({
            title: slug, company: fix, provider: echo, category: ids.get(slug), status: "active", deletedAt: null,
            serviceArea: {...DURRES, radiusKm: 30}, serviceAreaPoint: {type: "Point", coordinates: [DURRES.longitude, DURRES.latitude]},
        })),
        {title: "Logos", company: pros, provider: echo, category: ids.get("design-logo-branding"), status: "active", deletedAt: null},
    ]);
}));

async function fixCompany(): Promise<ICompany> {
    const company = await fixtures(() => Company.findById(fix));
    if (!company) throw new Error("Adria Home Fix is missing");
    return company;
}
const plain = (text: unknown) => String(text).replace(" [DEMO]", "");
const titlesOf = async (filter: Record<string, unknown>) =>
    (await fixtures(() => TaskRequest.find(filter).select("title").lean())).map((task) => plain(task.title)).sort();

describe("the task board demo (D172, P21.2a)", {timeout: 60000}, () => {
    it("seeds every state of the workflow, quietly and once", async () => {
        const company = await fixCompany();
        await fixtures(() => seedTaskBoardDemo(undefined, company));

        const tasks = await fixtures(() => TaskRequest.find({company: platform}).lean());
        expect(tasks).toHaveLength(8);
        const byKey = new Map(tasks.map((task) => [plain(task.name).replace("board-", ""), task]));
        expect(tasks.map((task) => task.status).sort()).toEqual(["awarded", "awarded", "closed", "closed", "open", "open", "open", "open"]);
        expect(tasks.filter((task) => task.restrictedToCompany).map((task) => String(task.restrictedToCompany))).toEqual([String(fix)]);
        expect(tasks.filter((task) => task.address).every((task) => task.approxPoint)).toBe(true);

        const leads = await fixtures(() => TaskLead.find({}).lean());
        const leadsOf = (key: string) => leads.filter((lead) => String(lead.taskRequest) === String(byKey.get(key)?._id))
            .map((lead) => [String(lead.company) === String(fix) ? "fix" : "pros", lead.origin, lead.status]).sort();
        expect(leadsOf("02-logo")).toEqual([["fix", "board", "quoted"], ["pros", "matched", "quoted"]]);
        expect(leadsOf("04-lights")).toEqual([["fix", "matched", "won"], ["pros", "board", "lost"]]);
        expect(leadsOf("05-translation")).toEqual([["pros", "board", "won"]]);
        expect(leadsOf("06-drain")).toEqual([["fix", "matched", "expired"]]);
        expect(leadsOf("07-cleaning")).toEqual([["fix", "matched", "expired"]]);
        expect(leads.filter((lead) => lead.origin === "matched" && String(lead.company) === String(fix)).every((lead) => typeof lead.distanceKm === "number")).toBe(true);

        const lightsBids = await fixtures(() => Bid.find({taskRequest: byKey.get("04-lights")?._id}).lean());
        expect(lightsBids.map((bid) => [String(bid.bidderCompany) === String(fix) ? "fix" : "pros", bid.status]).sort()).toEqual([["fix", "accepted"], ["pros", "rejected"]]);

        const orders = await fixtures(() => Order.find({}).lean());
        const lightsOrder = orders.find((order) => String(order.taskRequest) === String(byKey.get("04-lights")?._id));
        const translationOrder = orders.find((order) => String(order.taskRequest) === String(byKey.get("05-translation")?._id));
        expect([String(lightsOrder?.company), lightsOrder?.status, lightsOrder?.amount]).toEqual([String(fix), "in_progress", 120]);
        expect([String(translationOrder?.company), translationOrder?.status, translationOrder?.amount]).toEqual([String(pros), "completed", 260]);
        const milestones = await fixtures(() => OrderMilestone.find({order: lightsOrder?._id}).sort({orderIndex: 1}).lean());
        expect(milestones.map((milestone) => [milestone.amount, milestone.status])).toEqual([[70, "released"], [50, "pending"]]);
        const escrows = await fixtures(() => EscrowTransaction.find({}).lean());
        const escrowOf = (orderId: unknown) => escrows.filter((row) => String(row.order) === String(orderId)).map((row) => [row.type, row.amount.toString()]).sort();
        expect(escrowOf(lightsOrder?._id)).toEqual([["hold", "120.00"], ["release", "70.00"]]);
        expect(escrowOf(translationOrder?._id)).toEqual([["hold", "260.00"], ["release", "260.00"]]);
        const reviews = await fixtures(() => Review.find({}).lean());
        expect(reviews.map((review) => [String(review.order), review.rating])).toEqual([[String(translationOrder?._id), 5]]);

        // Seeding again changes nothing.
        await fixtures(() => seedTaskBoardDemo(undefined, company));
        expect(await fixtures(() => TaskRequest.countDocuments({}))).toBe(8);
        expect(await fixtures(() => TaskLead.countDocuments({}))).toBe(leads.length);
        expect(await fixtures(() => Order.countDocuments({}))).toBe(2);
    });

    it("leaves the board showing the open public tasks only", async () => {
        const company = await fixCompany();
        await fixtures(() => seedTaskBoardDemo(undefined, company));
        registerTasksPortalProvider();
        const page = await fixtures(() => getPortalProvider("tasks")!.browse({
            kind: "task", scope: {}, companyIds: [platform], skip: 0, limit: 24, filters: {}, languageCode: "en-US",
        }));
        expect(page.items.map((item) => plain(item.title)).sort())
            .toEqual(["Fix a dripping kitchen tap", "Hang shelves and assemble a wardrobe", "Logo for a new bakery in Tirana"]);
        expect(await titlesOf({restrictedToCompany: fix})).toEqual(["Service a gas boiler before winter"]);
    });
});

describe("the demo building jobs, posted on the apex (D172)", {timeout: 60000}, () => {
    const BUILDING = [
        "build-new-builds-house", "build-bathrooms-renovation", "build-renovation-commercial", "build-waterproofing-terraces", "build-demolition-strip-out",
        "build-masonry-retaining", "build-extensions-attic", "build-facades-renovation", "build-tiling-floor", "build-staircases-metal",
    ];

    /** Tirana Pros' chain as its company seed runs it: the jobs, its quotes and the order of the awarded one. */
    async function seedOnlineJobs() {
        return fixtures(async () => {
            const logger = getLogger("test");
            const [platformDoc, prosDoc, echoUser, euro, albania, durres] = await Promise.all([
                Company.findById(platform), Company.findById(pros), User.findById(echo), Currency.findOne({}), Country.findOne({}), City.findOne({}),
            ]);
            const buyers = await User.find({username: {$in: coreDemoCustomerSeeds.map((seed) => seed.username)}});
            if (!platformDoc || !prosDoc || !echoUser || !euro || !albania || !durres) throw new Error("fixtures missing");
            const address = {street: "Rruga Ibrahim Rugova 1", postalCode: "1001", country: albania._id, city: durres._id, latitude: 41.3275, longitude: 19.8187};
            const tasks = await createTaskRequests(logger, platformDoc, buyers, euro, address);
            const bids = await createBids(logger, platformDoc, prosDoc, echoUser, euro, tasks);
            const orders = await createOrders(logger, prosDoc, echoUser, echoUser, euro, {listings: [], bySeedKey: {}}, tasks, bids);
            return {tasks, orders};
        });
    }

    beforeEach(() => fixtures(async () => {
        const categories = BUILDING.map((slug) => ({_id: new ObjectId(), name: slug, slug, delivery: "onsite", order: 0, company: platform, deletedAt: null}));
        await ListingCategory.collection.insertMany(categories);
        // Tirana Pros renovates bathrooms: the bathroom job reaches it by matching, the rest it finds on the board.
        const bathrooms = categories.find((category) => category.slug === "build-bathrooms-renovation");
        await Listing.collection.insertOne({title: "Bathrooms", company: pros, provider: echo, category: bathrooms?._id, status: "active", deletedAt: null});
    }));

    it("stores them in the platform company, posted by the demo customers, with Tirana Pros' quotes, leads and order", async () => {
        const {tasks, orders} = await seedOnlineJobs();

        const stored = await fixtures(() => TaskRequest.find({}).lean());
        expect(stored).toHaveLength(10);
        expect(stored.every((task) => String(task.company) === String(platform))).toBe(true);
        const customers = (await fixtures(() => User.find({username: {$ne: "echo@echo.com"}}).lean())).map((user) => String(user._id));
        expect(new Set(stored.map((task) => String(task.requester)))).toEqual(new Set(customers));

        const bids = await fixtures(() => Bid.find({}).lean());
        expect(bids.every((bid) => String(bid.company) === String(platform) && String(bid.bidderCompany) === String(pros))).toBe(true);
        const leads = await fixtures(() => TaskLead.find({}).lean());
        expect(leads).toHaveLength(10);
        expect(leads.every((lead) => String(lead.company) === String(pros) && lead.bid)).toBe(true);
        expect(leads.map((lead) => lead.status).sort()).toEqual(["lost", "lost", "quoted", "quoted", "quoted", "quoted", "quoted", "quoted", "won", "won"]);
        // Tirana Pros has a bathroom listing: the bathroom job reached it by matching, the rest it found on the board.
        const bathroomJobs = stored.filter((task) => /bathroom/i.test(String(task.title))).map((task) => String(task._id));
        expect(leads.filter((lead) => lead.origin === "matched").map((lead) => String(lead.taskRequest)).sort()).toEqual(bathroomJobs.sort());
        const photos = await fixtures(() => Media.find({_id: {$in: stored.map((task) => task.mainImage)}}).lean());
        expect(photos.every((media) => (media.sharedWithCompanies ?? []).map(String).includes(String(pros)))).toBe(true);

        // The awarded job's order is Tirana Pros', for the buyer who posted the job.
        const bathroom = tasks.bySeedKey["task-02-bathroom-refit"];
        const order = orders.bySeedKey["order-03-bathroom-task-in-progress"];
        expect([String(order?.company), String(order?.taskRequest), String(order?.customer)]).toEqual([String(pros), String(bathroom?._id), String(bathroom?.requester)]);

        registerTasksPortalProvider();
        const page = await fixtures(() => getPortalProvider("tasks")!.browse({
            kind: "task", scope: {}, companyIds: [platform], skip: 0, limit: 24, filters: {}, languageCode: "en-US",
        }));
        expect(page.items.map((item) => plain(item.title)).sort()).toEqual([
            "Build a two-storey house on our plot", "Fit-out of a 90 m² office", "Repair and repaint a five-storey facade",
            "Retaining wall for a sloped garden", "Retile the kitchen floor and splashback", "Terrace leaking into the flat below",
        ]);

        // Seeding again changes nothing.
        await seedOnlineJobs();
        expect(await fixtures(() => TaskRequest.countDocuments({}))).toBe(10);
        expect(await fixtures(() => Bid.countDocuments({}))).toBe(10);
        expect(await fixtures(() => TaskLead.countDocuments({}))).toBe(10);
        expect(await fixtures(() => Order.countDocuments({}))).toBe(1);
    });
});
