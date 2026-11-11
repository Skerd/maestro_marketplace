import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";
import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import request from "supertest";

// The erasers load for enabled modules only, whatever the local `.env` enables.
vi.hoisted(() => {
    process.env.ENABLED_MODULES = "core,finance,marketplace";
});

vi.mock("@coreModule/utilities/middlewares/authMW", async () =>
    (await import("@coreModule/_tests/httpHarness")).authMWStub);
vi.mock("@coreModule/utilities/middlewares/rateLimiter", () => ({
    rateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import {appFor, callerHeader, type TestCaller} from "@coreModule/_tests/httpHarness";
import * as privacyRoute from "@coreModule/api/company/private/privacy";
import {loadPersonErasers} from "@coreModule/utilities/erasure/personErasure";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import Order from "@marketplaceModule/database/schemas/order/order";

const company = new ObjectId();
const accountId = new ObjectId();
const otherAccountId = new ObjectId();
const EMAIL = "ada@example.com";
const app = appFor([{...privacyRoute, module: "core"}]);
const admin: TestCaller = {userId: new ObjectId().toString(), companyId: company.toString(), isAdmin: true, modules: ["core", "finance", "marketplace"]};
const ids = {order: new ObjectId(), otherOrder: new ObjectId()};
const raw = <T>(fn: () => Promise<T>) => asCrossTenant("test reads raw collections", fn);

beforeAll(async () => {
    await connectTestDatabase();
    // Every module's eraser (and so its models) first, then every index: a collection or index created while the
    // erasure's transaction is open aborts it.
    await loadPersonErasers();
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    await raw(async () => {
        const {default: User} = await import("@coreModule/database/schemas/user/user");
        await User.collection.insertMany([{_id: accountId, username: EMAIL}, {_id: otherAccountId, username: "marco@example.com"}]);
        const order = {listing: new ObjectId(), provider: new ObjectId(), amount: 100, currency: new ObjectId(), status: "completed", company, deletedAt: null};
        await Order.collection.insertMany([
            {...order, _id: ids.order, name: "ORD-1", customer: accountId, note: "Gate code 1234"},
            {...order, _id: ids.otherOrder, name: "ORD-2", customer: otherAccountId, note: "Call first"},
        ]);
    });
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

describe("person erasure in a marketplace (D57)", {timeout: 60000}, () => {
    it("keeps the person's service orders for accounting without their note, and leaves other buyers alone", async () => {
        const erased = await request(app).post("/api/privacy/erasePerson").set(callerHeader(admin)).send({email: EMAIL, preview: false});
        expect(erased.body.error_code ?? "ok").toBe("ok");

        const order = (await raw(() => Order.collection.findOne({_id: ids.order})))!;
        expect(order).toMatchObject({name: "ORD-1", amount: 100});
        expect(order.note).toBeUndefined();
        expect(await raw(() => Order.collection.findOne({_id: ids.otherOrder}))).toMatchObject({note: "Call first"});
    });
});
