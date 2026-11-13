/**
 * TD-B219: the escrow demo step books its ledger rows on the orders the order step hands it, so every escrow of a seeded
 * company is created. The step runs only after the order step, so the home-repair provider (no orders) never runs it.
 */
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {ObjectId} from "mongodb";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";
import {getLogger} from "@coreModule/loggers/serverLog";
import {withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import Company from "@coreModule/database/schemas/company/company";
import Currency from "@coreModule/database/schemas/currency/currency";
import Order from "@marketplaceModule/database/schemas/order/order";
import OrderMilestone from "@marketplaceModule/database/schemas/orderMilestone/orderMilestone";
import EscrowTransaction from "@financeModule/database/schemas/escrowTransaction/escrowTransaction";
import {createEscrowTransactions} from "@marketplaceModule/database/demo/escrowTransactions.demo";
import {escrowTransactionsSeed} from "@marketplaceModule/database/seeds/finance/escrowTransactions.seed";
import type {CreateOrdersResult} from "@marketplaceModule/database/schemas/order/order.defaults";

const logger = getLogger("marketplace_escrow_demo_seed_test");
const companyId = new ObjectId();
/** Only `_id` and `createdBy` are read; the company row itself is not needed. */
const company = new Company({_id: companyId, createdBy: new ObjectId()});

beforeAll(async () => {
    await connectTestDatabase();
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

/** The orders the order step would return, with a name the escrow step could never find by name lookup. */
async function seededOrders(): Promise<CreateOrdersResult> {
    const currency = await Currency.create({name: "Euro", symbol: "€", abbreviation: "EUR", decimalPlaces: 2, company: companyId});
    const result: CreateOrdersResult = {orders: [], bySeedKey: {}};
    for (const seedKey of new Set(escrowTransactionsSeed.map((row) => row.orderSeedKey))) {
        const {insertedId} = await Order.collection.insertOne({
            name: `ORDER-${seedKey}`,
            customer: new ObjectId(),
            provider: new ObjectId(),
            amount: 120,
            currency: currency._id,
            status: "completed",
            company: companyId,
        });
        for (const row of escrowTransactionsSeed.filter((entry) => entry.orderSeedKey === seedKey && entry.milestoneIndex !== undefined)) {
            await OrderMilestone.collection.insertOne({
                order: insertedId,
                name: `Milestone ${row.milestoneIndex}`,
                amount: 40,
                currency: currency._id,
                orderIndex: row.milestoneIndex,
                status: "released",
                company: companyId,
            });
        }
        const order = await Order.findById(insertedId);
        if (!order) throw new Error(`order ${seedKey} was not stored`);
        result.orders.push(order);
        result.bySeedKey[seedKey] = order;
    }
    return result;
}

describe("marketplace escrow demo seed", () => {
    it("creates every escrow on the orders the order step returned", () => withTenant(companyId, async () => {
        const orders = await seededOrders();
        const created = await createEscrowTransactions(logger, company, orders);
        expect(created).toHaveLength(escrowTransactionsSeed.length);
        expect(await EscrowTransaction.countDocuments({company: companyId})).toBe(escrowTransactionsSeed.length);
        const orderIds = new Set(orders.orders.map((order) => String(order._id)));
        expect(created.every((escrow) => orderIds.has(String(escrow.order)))).toBe(true);

        // A re-run updates the same rows.
        await createEscrowTransactions(logger, company, orders);
        expect(await EscrowTransaction.countDocuments({company: companyId})).toBe(escrowTransactionsSeed.length);
    }));

    it("creates nothing when the company's demo seeded no orders", () => withTenant(companyId, async () => {
        const before = await EscrowTransaction.countDocuments({company: companyId});
        expect(await createEscrowTransactions(logger, company, {orders: [], bySeedKey: {}})).toEqual([]);
        expect(await EscrowTransaction.countDocuments({company: companyId})).toBe(before);
    }));
});
