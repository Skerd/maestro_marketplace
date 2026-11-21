import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

vi.hoisted(() => {
    process.env.ENABLED_MODULES = "core,finance,marketplace";
});
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);
// The live updates the server would forward (D172), captured instead of sent.
const pushes = vi.hoisted(() => ({room: [] as {code: string; room: string; payload: unknown}[], users: [] as {code: string; userIds: string[]; payload: unknown}[]}));
vi.mock("@coreModule/connections/connectToWebSocketServer", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@coreModule/connections/connectToWebSocketServer")>()),
    pushWebsocketRoomMessage: (message: {code: string; room: string; payload: unknown}) => { pushes.room.push(message); },
    pushWebsocketMessage: (message: {code: string; userIds: string[]; payload: unknown}) => { pushes.users.push(message); },
}));

import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import request from "supertest";
import {allPermissionTags, appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import {asCrossTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {getLogger} from "@coreModule/loggers/serverLog";
import Company from "@coreModule/database/schemas/company/company";
import User from "@coreModule/database/schemas/user/user";
import Currency from "@coreModule/database/schemas/currency/currency";
import City from "@coreModule/database/schemas/city/city";
import * as taskLeadRoute from "@marketplaceModule/api/marketplace/private/taskLead";
import * as taskBoardRoute from "@marketplaceModule/api/marketplace/private/taskBoard";
import TaskLead from "@marketplaceModule/database/schemas/taskLead/taskLead";
import TaskRequest from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import Bid from "@marketplaceModule/database/schemas/bid/bid";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import ListingCategory from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import MarketplaceConfig from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";
import {createJobLeads} from "@marketplaceModule/utilities/services/jobMatching";

const operator = new ObjectId();
const fix = new ObjectId();
const pros = new ObjectId();
const hidden = new ObjectId();
const [plumber, designer, translator, ghost, clerk, buyer] = [new ObjectId(), new ObjectId(), new ObjectId(), new ObjectId(), new ObjectId(), new ObjectId()];
const app = appFor([taskLeadRoute, taskBoardRoute].map((route) => ({...route, module: "marketplace"})));
const permissions = allPermissionTags([TaskLead]);
const as = (userId: ObjectId, companyId: ObjectId, tags = permissions): TestCaller => ({userId: userId.toString(), companyId: companyId.toString(), permissions: tags});
const asPlumber = as(plumber, fix);
const asDesigner = as(designer, pros);
const asTranslator = as(translator, pros);
const fixtures = <T>(fn: () => PromiseLike<T>): Promise<T> => asCrossTenant("test fixtures span companies", fn);
const post = (caller: TestCaller, path: string, body: object = {}) =>
    request(app).post(`/api/marketplace/${path}`).set(callerHeader(caller)).send(body);
const quote = (caller: TestCaller, task: ObjectId, amount: number) =>
    post(caller, "taskLead/quoteJob", {_id: task.toString(), amount, deliveryDays: 2, proposal: `Can do for ${amount}`});
const DAY = 86400000;

const jobs = {tap: new ObjectId(), logo: new ObjectId(), onFixSite: new ObjectId(), closed: new ObjectId(), designersOwn: new ObjectId()};
const design = new ObjectId();
let matchedLead: ObjectId;

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([TaskLead.init(), Bid.init(), MarketplaceConfig.init(), Listing.init()]);
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => fixtures(async () => {
    for (const collection of await mongoose.connection.db!.collections()) await collection.deleteMany({});
    const company = (_id: ObjectId, extra: Record<string, unknown> = {}) =>
        ({_id, name: String(_id), vat: String(_id), isActive: true, modules: ["core", "finance", "marketplace"], deletedAt: null, ...extra});
    // `pros` sells services but has nothing in these categories; `hidden` was hidden from the portal by the platform.
    await Company.collection.insertMany([company(operator), company(fix), company(pros), company(hidden, {hiddenFromPortal: true})]);
    await User.collection.insertMany([plumber, designer, translator, ghost, clerk, buyer].map((_id) => ({_id, username: `${_id}@test`, name: "N", surname: "S"})));
    const euro = (await Currency.collection.insertOne({name: "Euro", symbol: "€", abbreviation: "EUR", decimalPlaces: 2, deletedAt: null})).insertedId;
    await MarketplaceConfig.collection.insertMany([
        {company: operator, currency: euro, isOperator: true, listedOnPortal: false, deletedAt: null},
        {company: fix, currency: euro, listedOnPortal: true, deletedAt: null},
        {company: pros, currency: euro, listedOnPortal: true, deletedAt: null},
    ]);
    const city = (await City.collection.insertOne({name: "Durrës", deletedAt: null})).insertedId;
    const leaks = (await ListingCategory.collection.insertOne({name: "Leaks", slug: "leaks", delivery: "onsite", order: 0, company: operator, deletedAt: null})).insertedId;
    await ListingCategory.collection.insertOne({_id: design, name: "Design", slug: "design", delivery: "remote", order: 0, company: operator, deletedAt: null});
    const task = (_id: ObjectId, title: string, fields: Record<string, unknown> = {}) => ({
        _id, name: title, title, description: title, category: leaks, budgetMax: 60, currency: euro, requester: buyer, status: "open",
        address: {street: "Rruga Tregtare 5", postalCode: "2001", city, latitude: 41.32, longitude: 19.45},
        expiresAt: new Date(Date.now() + 10 * DAY), createdAt: new Date(), company: operator, deletedAt: null, ...fields,
    });
    await TaskRequest.collection.insertMany([
        task(jobs.tap, "Leaking faucet"),
        task(jobs.logo, "Bakery logo", {category: design, address: undefined, budgetMax: 200}),
        task(jobs.onFixSite, "Private job", {restrictedToCompany: fix}),
        task(jobs.closed, "Closed job", {status: "closed"}),
        task(jobs.designersOwn, "Designer's own job", {requester: designer}),
    ]);
    // Matching reached the plumber for the faucet; the designer offers logos online.
    const taps = (await Listing.collection.insertOne({title: "Taps", company: fix, provider: plumber, category: leaks, status: "active", deletedAt: null})).insertedId;
    await Listing.collection.insertOne({title: "Logos", company: pros, provider: designer, category: design, status: "active", avgRating: 5, deletedAt: null, createdAt: new Date()});
    matchedLead = (await TaskLead.collection.insertOne({
        name: "LEAD-1", taskRequest: jobs.tap, provider: plumber, listing: taps, origin: "matched", status: "new", company: fix, deletedAt: null, createdAt: new Date(),
    })).insertedId;
}));

describe("quoting from the task board (D172)", {timeout: 30000}, () => {
    it("lets any services company quote through a board lead, one live quote per company", async () => {
        const res = await quote(asDesigner, jobs.tap, 50);
        expect([res.status, res.body.message]).toEqual([200, "Quote sent"]);

        const lead = await fixtures(() => TaskLead.collection.findOne({company: pros, taskRequest: jobs.tap}));
        expect([lead?.origin, lead?.status, String(lead?.provider), lead?.listing]).toEqual(["board", "quoted", String(designer), undefined]);
        const bid = await fixtures(() => Bid.collection.findOne({_id: lead?.bid}));
        expect([String(bid?.company), String(bid?.bidderCompany), String(bid?.bidder), bid?.amount, bid?.status])
            .toEqual([String(operator), String(pros), String(designer), 50, "pending"]);

        // A second quote from the same person or anyone else in the company waits for the first to be decided.
        expect((await quote(asDesigner, jobs.tap, 40)).body.error_code).toBe("bid_already_submitted");
        expect((await quote(asTranslator, jobs.tap, 40)).body.error_code).toBe("bid_already_submitted");
        expect(await fixtures(() => TaskLead.collection.countDocuments({company: pros}))).toBe(1);
    });

    it("quotes through the matched lead when the provider has one", async () => {
        expect((await quote(asPlumber, jobs.tap, 45)).status).toBe(200);
        const leads = await fixtures(() => TaskLead.collection.find({company: fix}).toArray());
        expect(leads.map((lead) => [String(lead._id), lead.origin, lead.status])).toEqual([[String(matchedLead), "matched", "quoted"]]);
        // The matched quote counts for the company too.
        expect((await post(asPlumber, "taskLead/quote", {_id: matchedLead.toString(), amount: 1, deliveryDays: 1, proposal: "Again"})).body.error_code)
            .toBe("task_lead_not_open");
    });

    it("refuses the operator, a company hidden from the portal, the buyer, a private site task and a closed task", async () => {
        expect((await quote(as(clerk, operator), jobs.tap, 10)).body.error_code).toBe("task_board_bidder_not_allowed");
        expect((await quote(as(ghost, hidden), jobs.tap, 10)).body.error_code).toBe("task_board_bidder_not_allowed");
        expect((await quote(asDesigner, jobs.onFixSite, 10)).body.error_code).toBe("task_request_not_found");
        expect((await quote(asDesigner, jobs.closed, 10)).body.error_code).toBe("task_request_not_open");
        expect((await quote(asDesigner, jobs.designersOwn, 10)).body.error_code).toBe("cannot_bid_on_own_task_request");
        // A refused quote leaves no board lead behind: the action's transaction rolls it back.
        expect(await fixtures(() => TaskLead.collection.countDocuments({origin: "board"}))).toBe(0);
        expect(await fixtures(() => Bid.collection.countDocuments({}))).toBe(0);
    });

    it("does not let board leads use up a task's lead cap", async () => {
        expect((await quote(asPlumber, jobs.logo, 150)).status).toBe(200);
        await fixtures(() => MarketplaceConfig.collection.updateOne({company: operator}, {$set: {leadCap: 1}}));
        const logo = await fixtures(() => TaskRequest.findById(jobs.logo));
        if (!logo) throw new Error("the logo task is missing");
        // The plumber's board lead is not a notification: the one the cap allows still goes to the matched designer.
        expect(await withTenant(operator, () => createJobLeads(logo, {logger: getLogger("test"), languageCode: "en-US"}))).toBe(1);
        const leads = await fixtures(() => TaskLead.collection.find({taskRequest: jobs.logo}).sort({origin: 1}).toArray());
        expect(leads.map((lead) => [lead.origin, String(lead.provider)])).toEqual([["board", String(plumber)], ["matched", String(designer)]]);
    });

    it("tells the board, the task's page and the buyer of a quote live, with the public numbers only", async () => {
        pushes.room.length = 0;
        pushes.users.length = 0;
        expect((await quote(asDesigner, jobs.tap, 50)).status).toBe(200);
        const updates = pushes.room.filter((push) => push.code === "TASK_UPDATED");
        expect(updates.map((push) => push.room).sort()).toEqual([`liveTask_${jobs.tap}`, "liveTaskBoard"].sort());
        expect(updates[0].payload).toEqual({taskId: jobs.tap.toString(), status: "open", quotes: {count: 1}});
        expect(pushes.users).toEqual([{code: "TASK_QUOTE_RECEIVED", payload: {taskId: jobs.tap.toString()}, userIds: [buyer.toString()]}]);

        // A task posted on a provider's own site is not public: nothing goes to the rooms.
        pushes.room.length = 0;
        const {publishTaskChange} = await import("@marketplaceModule/utilities/services/taskBoardEvents");
        await fixtures(() => publishTaskChange(jobs.onFixSite, getLogger("test")));
        expect(pushes.room).toEqual([]);
    });

    it("lists the open public tasks in the panel with the caller's own lead and quote", async () => {
        await quote(asDesigner, jobs.tap, 50);
        const board = await post(asDesigner, "taskBoard", {});
        expect(board.status).toBe(200);
        expect(board.body.data.map((task: {title: string}) => task.title).sort()).toEqual(["Bakery logo", "Designer's own job", "Leaking faucet"]);
        const tap = board.body.data.find((task: {title: string}) => task.title === "Leaking faucet");
        expect(tap).toMatchObject({quotes: {count: 1}, myLead: {status: "quoted", bid: {amount: 50, status: "pending"}}});
        expect(tap.quotes.average).toBeUndefined();
        expect(JSON.stringify(tap)).not.toContain("Rruga Tregtare");

        const plumbersView = await post(asPlumber, "taskBoard/single", {_id: jobs.tap.toString()});
        expect(plumbersView.body).toMatchObject({title: "Leaking faucet", myLead: {_id: matchedLead.toString(), status: "new"}});
        expect((await post(asPlumber, "taskBoard", {category: design.toString()})).body.data.map((task: {title: string}) => task.title)).toEqual(["Bakery logo"]);

        const noQuoting = as(clerk, pros, permissions.filter((tag) => !tag.includes("quoteJob")));
        expect((await post(noQuoting, "taskBoard", {})).body.error_code).toBe("user_permissions_not_sufficient");
    });
});
