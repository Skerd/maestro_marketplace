/** TD-B217: the order picker labels a stored order by its id, even one it no longer offers, but only the caller's own. */
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import request from "supertest";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);
vi.mock("@coreModule/utilities/middlewares/rateLimiter", () => ({
    rateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import {allPermissionTags, appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import * as orderRoute from "@marketplaceModule/api/marketplace/private/order";
import Order from "@marketplaceModule/database/schemas/order/order";
import Review from "@marketplaceModule/database/schemas/review/review";

const companyId = new ObjectId();
const otherCompanyId = new ObjectId();
const customerId = new ObjectId();
const app = appFor([{...orderRoute, module: "marketplace"}]);
const customer: TestCaller = {userId: customerId.toString(), companyId: companyId.toString(), isAdmin: false, permissions: allPermissionTags([Order, Review])};
const select = (body: Record<string, unknown>) => request(app).post("/api/marketplace/order/select").set(callerHeader(customer)).send({page: 1, ...body});
const acrossCompanies = <T>(fn: () => PromiseLike<T>): Promise<T> => asCrossTenant("test fixtures span companies", fn);

async function seedOrder(name: string, input: {company?: ObjectId; customer?: ObjectId} = {}): Promise<ObjectId> {
    const {insertedId} = await Order.collection.insertOne({
        name, company: input.company ?? companyId, customer: input.customer ?? customerId, provider: new ObjectId(),
        status: "completed", deletedAt: null, createdAt: new Date(),
    });
    return insertedId;
}

beforeAll(async () => {
    await connectTestDatabase();
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => acrossCompanies(async () => {
    for (const collection of await mongoose.connection.db!.collections()) {
        await collection.deleteMany({});
    }
}));

describe("marketplace order picker select by ids", {timeout: 60000}, () => {
    it("labels a reviewed order past the review picker's list, never another party's or company's", () => acrossCompanies(async () => {
        const open = await seedOrder("ORD-1");
        const reviewed = await seedOrder("ORD-2");
        await Review.collection.insertOne({company: companyId, order: reviewed, rating: 5, deletedAt: null});
        const strangers = await seedOrder("ORD-3", {customer: new ObjectId()});
        const foreign = await seedOrder("ORD-4", {company: otherCompanyId});

        const offered = await select({limit: 20, status: "completed", forReview: true});
        expect(offered.status).toBe(200);
        expect(offered.body.data).toEqual([{value: open.toString(), label: "ORD-1"}]);

        const byId = await select({limit: 20, status: "completed", forReview: true, name: "nothing", ids: [reviewed, strangers, foreign].map(String)});
        expect(byId.status).toBe(200);
        expect(byId.body.data).toEqual([{value: reviewed.toString(), label: "ORD-2"}]);
    }));
});
