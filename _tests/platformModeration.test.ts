import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

// The sellers are found by their module, whatever the local `.env` enables.
vi.hoisted(() => {
    process.env.ENABLED_MODULES = "core,finance,marketplace";
});
/** The company whose own site the public routes answer for. */
const site = vi.hoisted(() => ({id: ""}));

vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);
vi.mock("@coreModule/utilities/marketing/portalStorefront", async (importOriginal) => {
    const {setRequestTenant} = await import("@coreModule/utilities/endpoints/tenantScope");
    const {ObjectId: Id} = await import("mongodb");
    return {
        ...(await importOriginal<typeof import("@coreModule/utilities/marketing/portalStorefront")>()),
        resolveStorefrontContext: async () => {
            setRequestTenant(new Id(site.id));
            return {mode: "tenant", company: {_id: new Id(site.id)}};
        },
    };
});

import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";
import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import request from "supertest";
import {allPermissionTags, appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import {asCrossTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {getLogger} from "@coreModule/loggers/serverLog";
import Company from "@coreModule/database/schemas/company/company";
import Currency from "@coreModule/database/schemas/currency/currency";
import MarketplaceConfig from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";
import ListingCategory from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import Order from "@marketplaceModule/database/schemas/order/order";
import Review from "@marketplaceModule/database/schemas/review/review";
import Dispute from "@marketplaceModule/database/schemas/dispute/dispute";
import TaskRequest from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import Bid from "@marketplaceModule/database/schemas/bid/bid";
import * as shopListingsRoute from "@marketplaceModule/api/marketplace/public/shopListings";
import * as shopListingRoute from "@marketplaceModule/api/marketplace/public/shopListing";
import * as shopReviewsRoute from "@marketplaceModule/api/marketplace/public/shopMarketplaceReviews";
import * as reviewRoute from "@marketplaceModule/api/marketplace/private/review";
import * as disputeRoute from "@marketplaceModule/api/marketplace/private/dispute";
import {marketplaceReportables} from "@marketplaceModule/domain/reports/marketplaceReportables";
import {setReportableHidden} from "@coreModule/domain/reports/reportDesk";
import {refreshListingRating} from "@marketplaceModule/domain/reviews/listingRating";
import {findJobMatches} from "@marketplaceModule/utilities/services/jobMatching";
import {loadPublicTask} from "@marketplaceModule/utilities/services/taskBoard";
import {taskQuoteStats} from "@marketplaceModule/utilities/services/publicTasks";
import {bidVisibilityFilter} from "@marketplaceModule/utilities/services/marketplaceAccess";

// The platform company keeps the portal's tasks and decides disputes, running core only (D197).
const platform = new ObjectId();
const seller = new ObjectId();
const bidderCompany = new ObjectId();
const eur = new ObjectId();
const category = new ObjectId();
const provider = new ObjectId();
const customer = new ObjectId();
const platformAdmin = new ObjectId();
const lang = "en-US";
const logger = getLogger("platform_moderation_test");

const app = appFor([shopListingsRoute, shopListingRoute, shopReviewsRoute, reviewRoute, disputeRoute].map((route) => ({...route, module: "marketplace"})));
const fixtures = <T>(fn: () => PromiseLike<T>): Promise<T> => asCrossTenant("test fixtures span companies", fn);

const visitor: TestCaller = {userId: customer.toString(), companyId: new ObjectId().toString(), permissions: []};
const sellerAdmin: TestCaller = {userId: provider.toString(), companyId: seller.toString(), isAdmin: true, permissions: allPermissionTags([Review, Dispute])};
const platformCompanyAdmin: TestCaller = {userId: new ObjectId().toString(), companyId: platform.toString(), isAdmin: true, isPlatformOwner: true, permissions: allPermissionTags([Dispute])};
const platformCompanyStaff: TestCaller = {...platformCompanyAdmin, userId: new ObjectId().toString(), isAdmin: false};

const call = (caller: TestCaller, method: "post" | "delete", path: string, body: object) =>
    request(app)[method](path).set(callerHeader(caller)).send(body);

/** The report desk's view of a marketplace kind (D191), called as core calls it: in the tenant of the owning company. */
const reportable = (kind: string) => marketplaceReportables.find((definition) => definition.kind === kind)!;
const snapshot = (kind: string, recordId: ObjectId) => fixtures(() => reportable(kind).snapshot({recordId, logger, languageCode: lang}));
// The report desk's own step (D191): core saves the flag in the record's company, then the kind's `onHidden` runs.
const setHidden = (kind: string, recordId: ObjectId, owner: ObjectId, hidden: boolean) =>
    setReportableHidden({...reportable(kind), module: "marketplace"}, owner, {recordId, hidden, decidedBy: platformAdmin, logger, languageCode: lang});

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([Order.init(), Review.init(), Dispute.init(), Bid.init(), TaskRequest.init()]);
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => fixtures(async () => {
    site.id = seller.toString();
    for (const collection of await mongoose.connection.db!.collections()) await collection.deleteMany({});
    const company = (_id: ObjectId, name: string, siteSlug: string) => ({_id, name, siteSlug, vat: `VAT-${name}`, isActive: true, modules: ["core", "finance", "marketplace"], deletedAt: null});
    await Company.collection.insertMany([{_id: platform, name: "Platform", vat: "VAT-Platform", isActive: true, isPlatformOwner: true, modules: ["core"], deletedAt: null}, company(seller, "Seller", "seller"), company(bidderCompany, "Bidder", "bidder")]);
    await MarketplaceConfig.collection.insertMany([
        {company: platform, currency: eur, listedOnPortal: false, deletedAt: null},
        {company: seller, currency: eur, listedOnPortal: true, deletedAt: null},
    ]);
    await Currency.collection.insertOne({_id: eur, name: "Euro", abbreviation: "EUR", symbol: "€", decimalPlaces: 2, company: seller, deletedAt: null});
    await ListingCategory.collection.insertOne({_id: category, name: "Design", slug: "design", delivery: "remote", order: 0, company: platform, deletedAt: null});
}));

async function seedListing(title: string): Promise<ObjectId> {
    const {insertedId} = await fixtures(() => Listing.collection.insertOne({
        name: `LIST-${title}`, title, category, provider, price: 100, priceCurrency: eur, status: "active",
        mainImage: new ObjectId(), listingPackages: [], company: seller, deletedAt: null, createdAt: new Date(),
    }));
    return insertedId;
}

async function seedOrder(listing: ObjectId, status = "completed"): Promise<ObjectId> {
    const {insertedId} = await fixtures(() => Order.collection.insertOne({
        name: `ORD-${new ObjectId().toString()}`, listing, customer, provider, amount: 100, currency: eur, status,
        company: seller, deletedAt: null, createdAt: new Date(),
    }));
    return insertedId;
}

describe("what the platform hides is gone from the public (D191)", () => {
    it("a hidden listing leaves the services list and its page, and comes back when shown again", async () => {
        const hidden = await seedListing("Logo design");
        await seedListing("Website");
        const listed = async () => (await call(visitor, "post", "/api/marketplace/shopListings", {})).body.data.map((card: {title: string}) => card.title).sort();
        expect(await listed()).toEqual(["Logo design", "Website"]);

        await setHidden("marketplace.listing", hidden, seller, true);
        expect(await listed()).toEqual(["Website"]);
        const page = await call(visitor, "post", "/api/marketplace/shopListing", {id: hidden.toString()});
        expect(page.body.error_code).toBe("listing_not_found");
        // Its company's staff still see it, marked.
        expect((await fixtures(() => Listing.findById(hidden)))?.hiddenByPlatform).toBe(true);
        expect(await snapshot("marketplace.listing", hidden)).toMatchObject({title: "Logo design", companyId: seller, hidden: true});
        expect((await snapshot("marketplace.listing", hidden))?.url).toContain(`/services/service?id=${hidden.toString()}`);

        await setHidden("marketplace.listing", hidden, seller, false);
        expect(await listed()).toEqual(["Logo design", "Website"]);
    });

    it("a hidden review leaves the public reviews and the listing's rating", async () => {
        const listing = await seedListing("Logo design");
        const [good, bad] = [new ObjectId(), new ObjectId()];
        await fixtures(async () => Review.collection.insertMany([
            {_id: good, order: await seedOrder(listing), listing, rating: 5, comment: "Great", reviewer: customer, company: seller, deletedAt: null, createdAt: new Date()},
            {_id: bad, order: await seedOrder(listing), listing, rating: 1, comment: "Spam spam", reviewer: new ObjectId(), company: seller, deletedAt: null, createdAt: new Date()},
        ]));
        await withTenant(seller, () => refreshListingRating(listing, {}));
        const rating = async () => fixtures(async () => {
            const row = await Listing.findById(listing).lean();
            return [row?.avgRating, row?.reviewCount];
        });
        expect(await rating()).toEqual([3, 2]);

        await setHidden("marketplace.review", bad, seller, true);
        expect(await rating()).toEqual([5, 1]);
        const reviews = await call(visitor, "post", "/api/marketplace/shopMarketplaceReviews", {listingId: listing.toString()});
        expect(reviews.body.data.map((review: {comment: string}) => review.comment)).toEqual(["Great"]);
        expect(reviews.body.total).toBe(1);
        expect(await snapshot("marketplace.review", bad)).toMatchObject({title: "★ 1 · Spam spam", companyId: seller, hidden: true});

        await setHidden("marketplace.review", bad, seller, false);
        expect(await rating()).toEqual([3, 2]);
    });

    it("a hidden task leaves the task board and job matching", async () => {
        const task = new ObjectId();
        await fixtures(() => TaskRequest.collection.insertOne({
            _id: task, title: "Logo for a bakery", name: "TASK-1", description: "A logo", company: platform, requester: customer,
            category, status: "open", expiresAt: new Date(Date.now() + 86400000), currency: eur, deletedAt: null, createdAt: new Date(),
        }));
        await seedListing("Logo design");
        const job = await fixtures(() => TaskRequest.findById(task));
        expect((await findJobMatches(job!)).map((match) => String(match.company))).toEqual([seller.toString()]);
        expect(String((await loadPublicTask(task.toString(), {logger, languageCode: lang}))._id)).toBe(task.toString());

        await setHidden("marketplace.job", task, platform, true);
        await expect(loadPublicTask(task.toString(), {logger, languageCode: lang})).rejects.toMatchObject({error_code: "task_request_not_found"});
        expect(await findJobMatches((await fixtures(() => TaskRequest.findById(task)))!)).toEqual([]);
        expect(await snapshot("marketplace.job", task)).toMatchObject({title: "Logo for a bakery", companyId: platform, authorAccountId: customer, hidden: true});
    });

    it("a hidden listing reaches no job", async () => {
        const task = new ObjectId();
        await fixtures(() => TaskRequest.collection.insertOne({
            _id: task, title: "Logo", name: "TASK-2", description: "A logo", company: platform, requester: customer,
            category, status: "open", expiresAt: new Date(Date.now() + 86400000), currency: eur, deletedAt: null, createdAt: new Date(),
        }));
        const listing = await seedListing("Logo design");
        await setHidden("marketplace.listing", listing, seller, true);
        expect(await findJobMatches((await fixtures(() => TaskRequest.findById(task)))!)).toEqual([]);
    });

    it("a hidden bid is not shown to the buyer nor counted on the board, and its report names the quoting company", async () => {
        const task = new ObjectId();
        const [shown, hidden] = [new ObjectId(), new ObjectId()];
        await fixtures(async () => {
            await TaskRequest.collection.insertOne({
                _id: task, title: "Logo", name: "TASK-3", description: "A logo", company: platform, requester: customer,
                category, status: "open", expiresAt: new Date(Date.now() + 86400000), currency: eur, deletedAt: null, createdAt: new Date(),
            });
            const bid = (_id: ObjectId, proposal: string) => ({
                _id, name: `BID-${proposal}`, taskRequest: task, bidder: provider, bidderCompany, amount: 90, currency: eur,
                proposal, deliveryDays: 3, status: "pending", company: platform, deletedAt: null, createdAt: new Date(),
            });
            await Bid.collection.insertMany([bid(shown, "Fair offer"), bid(hidden, "Pay me outside the platform")]);
        });

        await setHidden("marketplace.bid", hidden, bidderCompany, true);
        const buyer = {userId: customer.toString(), isAdmin: false};
        const visible = await withTenant(platform, async () => Bid.find({company: platform, ...(await bidVisibilityFilter(platform, buyer, {}))}));
        expect(visible.map((bid) => bid.proposal)).toEqual(["Fair offer"]);
        expect((await taskQuoteStats([{_id: task}])).get(task.toString())).toEqual({count: 1});
        expect(await snapshot("marketplace.bid", hidden)).toMatchObject({title: "Pay me outside the platform", companyId: bidderCompany, authorAccountId: provider, hidden: true});
    });
});

describe("reviews are published by default (D191)", () => {
    it("no one in the seller's company deletes a review, not even an admin", async () => {
        const listing = await seedListing("Logo design");
        const review = new ObjectId();
        await fixtures(async () => Review.collection.insertOne({
            _id: review, order: await seedOrder(listing), listing, rating: 1, comment: "Bad", reviewer: customer, company: seller, deletedAt: null, createdAt: new Date(),
        }));

        const refused = await call(sellerAdmin, "delete", "/api/marketplace/review", {_id: review.toString()});
        expect([refused.status, refused.body.error_code]).toEqual([403, "user_permissions_not_sufficient"]);
        expect((await fixtures(() => Review.findById(review).lean()))?.deletedAt).toBeNull();
    });
});

describe("the platform company decides disputes (D191, D197)", () => {
    async function seedDispute(): Promise<{dispute: ObjectId; order: ObjectId}> {
        const order = await seedOrder(await seedListing("Logo design"), "in_progress");
        const dispute = new ObjectId();
        await fixtures(() => Dispute.collection.insertOne({
            _id: dispute, order, initiator: customer, reason: "Never delivered", status: "open", company: seller, deletedAt: null, createdAt: new Date(),
        }));
        return {dispute, order};
    }

    it("refuses the seller's admin to start the review, resolve, close or delete a dispute", async () => {
        const {dispute} = await seedDispute();
        for (const verb of ["startReview", "resolve", "close"]) {
            const refused = await call(sellerAdmin, "post", `/api/marketplace/dispute/${verb}`, {_id: dispute.toString(), resolution: "My call"});
            expect([verb, refused.status, refused.body.error_code]).toEqual([verb, 403, "dispute_platform_only"]);
        }
        const deleted = await call(sellerAdmin, "delete", "/api/marketplace/dispute", {_id: dispute.toString()});
        expect([deleted.status, deleted.body.error_code]).toEqual([403, "dispute_platform_only"]);
        expect(await fixtures(() => Dispute.findById(dispute).lean())).toMatchObject({status: "open", deletedAt: null});
    });

    it("lets the platform company's admin decide it in the dispute's own company, and refuses its other staff", async () => {
        const {dispute, order} = await seedDispute();
        const notAdmin = await call(platformCompanyStaff, "post", "/api/marketplace/dispute/resolve", {_id: dispute.toString(), resolution: "Delivered"});
        expect(notAdmin.body.error_code).toBe("dispute_platform_only");

        const resolved = await call(platformCompanyAdmin, "post", "/api/marketplace/dispute/resolve", {_id: dispute.toString(), resolution: "The files were delivered"});
        expect([resolved.status, resolved.body.error_code]).toEqual([200, undefined]);
        expect(await fixtures(() => Dispute.findById(dispute).lean())).toMatchObject({status: "resolved", resolution: "The files were delivered", company: seller});
        expect((await fixtures(() => Order.findById(order).lean()))?.status).toBe("completed");
    });

    it("lists every company's disputes to the platform company only, with the company and whether the caller decides", async () => {
        const {dispute} = await seedDispute();
        const list = await call(platformCompanyAdmin, "post", "/api/marketplace/dispute/platform", {offset: 0, limit: 10});
        expect(list.status).toBe(200);
        expect(list.body.data.map((row: {_id: string; company?: {name: string}; canDecide?: boolean}) => [row._id, row.company?.name, row.canDecide]))
            .toEqual([[dispute.toString(), "Seller", true]]);
        expect((await call(platformCompanyStaff, "post", "/api/marketplace/dispute/platform", {offset: 0, limit: 10})).body.data[0].canDecide).toBeUndefined();

        const access = await call(sellerAdmin, "post", "/api/marketplace/dispute/access", {});
        expect(access.body.data).toEqual({isPlatform: false, canDecide: false});
        const refused = await call(sellerAdmin, "post", "/api/marketplace/dispute/platform", {offset: 0, limit: 10});
        expect(refused.body.error_code).toBe("dispute_platform_only");
    });
});
