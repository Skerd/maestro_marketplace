import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

vi.hoisted(() => {
    process.env.ENABLED_MODULES = "core,finance,marketplace";
});

import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";
import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import {withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {clearPortalProviders, getPortalProvider} from "@coreModule/domain/portal/portalProviderRegistry";
import type {PortalNewSinceContext} from "@coreModule/domain/portal/portalProvider.types";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import TaskRequest from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import {registerServicesPortalProvider} from "@marketplaceModule/domain/portal/servicesPortalProvider";
import {registerTasksPortalProvider} from "@marketplaceModule/domain/portal/tasksPortalProvider";

/* D178, P23.7: the services and tasks sections answer "what was listed after a date". */

const provider = new ObjectId();
const operator = new ObjectId();
const since = new Date("2026-11-01T00:00:00Z");
const day = (date: string) => new Date(`${date}T00:00:00Z`);
const ids = {logo: new ObjectId(), seo: new ObjectId(), oldService: new ObjectId(), paused: new ObjectId(), tap: new ObjectId(), fence: new ObjectId(), oldTask: new ObjectId(), closed: new ObjectId()};

function ask(key: string, company: ObjectId, fields: Partial<PortalNewSinceContext>) {
    const section = getPortalProvider(key);
    if (!section?.newSince) throw new Error(`the ${key} section must answer newSince`);
    const newSince = section.newSince;
    return withTenant(company, () => newSince({kind: "", scope: {companyId: company}, companyIds: [company], filters: {}, since, limit: 10, languageCode: "en-US", ...fields}));
}
const titles = (result: {items: {title: string}[]}) => result.items.map((item) => item.title);

beforeAll(async () => {
    await connectTestDatabase();
    registerServicesPortalProvider();
    registerTasksPortalProvider();
}, 120000);

afterAll(async () => {
    clearPortalProviders();
    await disconnectTestDatabase();
});

beforeEach(async () => {
    const db = mongoose.connection.db!;
    for (const collection of await db.collections()) await collection.deleteMany({});
    const company = (_id: ObjectId, name: string, siteSlug: string) => ({_id, name, siteSlug, isActive: true, modules: ["core", "finance", "marketplace"], deletedAt: null});
    await db.collection("companies").insertMany([company(provider, "Pixel Studio", "pixel"), company(operator, "Operator", "tasks")]);
    const listing = (_id: ObjectId, title: string, createdAt: Date, extra: Record<string, unknown> = {}) => ({_id, company: provider, title, price: 100, status: "active", deletedAt: null, createdAt, ...extra});
    await Listing.collection.insertMany([
        listing(ids.logo, "Logo design", day("2026-11-03")),
        listing(ids.seo, "SEO audit", day("2026-11-02"), {price: 300}),
        listing(ids.oldService, "Old logo pack", day("2026-10-01")),
        listing(ids.paused, "Paused logo", day("2026-11-04"), {status: "paused"}),
    ]);
    const task = (_id: ObjectId, title: string, createdAt: Date, extra: Record<string, unknown> = {}) => ({
        _id, company: operator, restrictedToCompany: null, title, status: "open", expiresAt: day("2099-01-01"), deletedAt: null, createdAt, ...extra,
    });
    await TaskRequest.collection.insertMany([
        task(ids.tap, "Fix a tap", day("2026-11-03")),
        task(ids.fence, "Paint a fence", day("2026-11-02")),
        task(ids.oldTask, "Old tap", day("2026-10-01")),
        task(ids.closed, "Closed tap", day("2026-11-04"), {status: "closed"}),
    ]);
});

describe("services and tasks new since a date (P23.7)", () => {
    it("lists the active service listings published after the date, newest first, with the saved words and price", async () => {
        const all = await ask("services", provider, {kind: "service"});
        expect(all.total).toBe(2);
        expect(titles(all)).toEqual(["Logo design", "SEO audit"]);
        expect(all.items[0]).toEqual(expect.objectContaining({kind: "service", id: ids.logo.toString(), section: "services"}));
        expect(titles(await ask("services", provider, {kind: "service", query: "logo"}))).toEqual(["Logo design"]);
        expect(titles(await ask("services", provider, {kind: "service", priceMin: 200}))).toEqual(["SEO audit"]);
        expect(titles(await ask("services", provider, {kind: "service", since: new Date(0), ids: [ids.oldService.toString(), ids.paused.toString()]}))).toEqual(["Old logo pack"]);
    });

    it("lists the open public tasks posted after the date, and the tasks a person keeps while open", async () => {
        const all = await ask("tasks", operator, {kind: "task"});
        expect(all.total).toBe(2);
        expect(titles(all)).toEqual(["Fix a tap", "Paint a fence"]);
        expect(titles(await ask("tasks", operator, {kind: "task", query: "tap"}))).toEqual(["Fix a tap"]);
        expect(titles(await ask("tasks", operator, {kind: "task", since: new Date(0), ids: [ids.oldTask.toString(), ids.closed.toString()]}))).toEqual(["Old tap"]);
    });
});

describe("a listing's and a task's page (D181)", () => {
    it("finds what each page names by id, and nothing for a paused listing or a closed task", async () => {
        const at = (key: string, company: ObjectId, path: string) => {
            const section = getPortalProvider(key);
            if (!section?.itemAt) throw new Error(`the ${key} section must answer itemAt`);
            const itemAt = section.itemAt;
            return withTenant(company, () => itemAt({scope: {companyId: company}, companyId: company, path, languageCode: "en-US"}));
        };
        expect(getPortalProvider("services")?.sitePath).toBe("services");
        expect(await at("services", provider, `/service?id=${ids.seo.toString()}`)).toMatchObject({schemaType: "Service", item: {title: "SEO audit"}});
        expect(await at("services", provider, `/service?id=${ids.paused.toString()}`)).toBeUndefined();
        expect(await at("tasks", operator, `/task?id=${ids.tap.toString()}`)).toMatchObject({schemaType: "Demand", item: {title: "Fix a tap"}});
        expect(await at("tasks", operator, `/task?id=${ids.closed.toString()}`)).toBeUndefined();
    });
});
