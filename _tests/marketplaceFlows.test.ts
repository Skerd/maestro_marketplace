import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";
import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import {getLogger} from "@coreModule/loggers/serverLog";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import ListingAddOn from "@marketplaceModule/database/schemas/listingAddOn/listingAddOn";
import Order from "@marketplaceModule/database/schemas/order/order";
import OrderDelivery from "@marketplaceModule/database/schemas/orderDelivery/orderDelivery";
import OrderMilestone from "@marketplaceModule/database/schemas/orderMilestone/orderMilestone";
import TaskRequest from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import Bid from "@marketplaceModule/database/schemas/bid/bid";
import Review from "@marketplaceModule/database/schemas/review/review";
import EscrowTransaction from "@financeModule/database/schemas/escrowTransaction/escrowTransaction";
import {escrowBalance} from "@financeModule/utilities/escrowHelper";
import {OrderActions} from "@marketplaceModule/database/schemas/order/order.actions";
import {ListingActions} from "@marketplaceModule/database/schemas/listing/listing.actions";
import {BidActions} from "@marketplaceModule/database/schemas/bid/bid.actions";
import {runOrderAutoComplete} from "@marketplaceModule/utilities/cronJobs/orderAutoCompleteJob";
import {orderChildFilter, orderPartyFilter} from "@marketplaceModule/utilities/services/marketplaceAccess";
import {withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {addMoney} from "armonia/src/modules/core/helpers/money";

const companyId = new ObjectId();
/** The tests act on this company's data, as its requests and jobs do (D16). */
const asCompany = <T>(fn: () => PromiseLike<T>): Promise<T> => withTenant(companyId, fn);
const currencyId = new ObjectId();
const otherCurrencyId = new ObjectId();
const customerId = new ObjectId();
const providerId = new ObjectId();
const strangerId = new ObjectId();
const lang = "en-US";
const logger = getLogger("marketplace_flows_test");

beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([Order.init(), OrderDelivery.init(), Review.init(), Bid.init()]);
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => asCompany(async () => {
    const db = mongoose.connection.db!;
    for (const collection of await db.collections()) {
        await collection.deleteMany({});
    }
}));

function as(userId: ObjectId, permissions: string[] = [], isAdmin = false) {
    return {
        logger,
        languageCode: lang,
        company: {_id: companyId},
        actionUserCtx: {userId: userId.toString(), orgId: companyId.toString(), isAdmin, isSelf: true, permissions},
    };
}

async function seedListing(overrides: Record<string, unknown> = {}): Promise<ObjectId> {
    const {insertedId} = await Listing.collection.insertOne({
        name: `LIST-${new ObjectId().toString()}`,
        title: "Logo design",
        category: new ObjectId(),
        provider: providerId,
        price: 100,
        priceCurrency: currencyId,
        deliveryDays: 3,
        status: "active",
        mainImage: new ObjectId(),
        company: companyId,
        ...overrides,
    });
    return insertedId;
}

/** A listing order taken through accept and start, so its escrow is held and work is in progress. */
async function seedOrderInProgress(price = 100): Promise<ObjectId> {
    const listing = await seedListing({price});
    const actions = new OrderActions();
    await actions.createFromListing({...as(customerId), listing: listing.toString()});
    const order = await Order.findOne({listing});
    await actions.accept({...as(providerId), _id: order!._id.toString()});
    await actions.start({...as(providerId), _id: order!._id.toString()});
    return order!._id;
}

async function ledgerTotals(orderId: ObjectId): Promise<Record<string, number>> {
    const rows = await EscrowTransaction.find({order: orderId});
    return rows.reduce<Record<string, number>>((totals, row) => {
        totals[row.type] = addMoney(totals[row.type] ?? 0, row.amount);
        return totals;
    }, {});
}

describe("marketplace order escrow", {timeout: 30000}, () => {
    it("never pays out more than the hold across milestones and final acceptance", () => asCompany(async () => {
        const orderId = await seedOrderInProgress(100);
        const actions = new OrderActions();

        await actions.createMilestone({...as(customerId), order: orderId.toString(), name: "Sketches", amount: 30});
        const milestone = await OrderMilestone.findOne({order: orderId});
        expect(milestone!.currency.toString()).toBe(currencyId.toString());

        await actions.releaseMilestone({...as(customerId), milestone: milestone!._id.toString()});
        expect(await escrowBalance(orderId, companyId, {})).toBe(70);
        expect((await Order.findById(orderId))!.status).toBe("in_progress");

        await actions.submitDelivery({...as(providerId), _id: orderId.toString(), message: "Final files"});
        await actions.acceptDelivery({...as(customerId), _id: orderId.toString()});

        const totals = await ledgerTotals(orderId);
        expect(totals.hold).toBe(100);
        expect(totals.release + totals.fee).toBe(100);
        expect(await escrowBalance(orderId, companyId, {})).toBe(0);
        expect((await Order.findById(orderId))!.status).toBe("completed");
    }));

    it("refunds only what is still held when the provider cancels", () => asCompany(async () => {
        const orderId = await seedOrderInProgress(100);
        const actions = new OrderActions();
        await actions.createMilestone({...as(customerId), order: orderId.toString(), name: "Draft", amount: 40});
        const milestone = await OrderMilestone.findOne({order: orderId});
        await actions.releaseMilestone({...as(customerId), milestone: milestone!._id.toString()});

        await actions.cancel({...as(providerId), _id: orderId.toString()});

        const totals = await ledgerTotals(orderId);
        expect(totals.refund).toBe(60);
        expect(await escrowBalance(orderId, companyId, {})).toBe(0);
    }));

    it("refuses a customer cancel once work has started", () => asCompany(async () => {
        const orderId = await seedOrderInProgress();
        await expect(new OrderActions().cancel({...as(customerId), _id: orderId.toString()}))
            .rejects.toMatchObject({error_code: "customer_cannot_cancel_started_order"});
    }));

    it("refuses a milestone larger than what is left of the order", () => asCompany(async () => {
        const orderId = await seedOrderInProgress(100);
        const actions = new OrderActions();
        await actions.createMilestone({...as(customerId), order: orderId.toString(), name: "First", amount: 80});
        await expect(actions.createMilestone({...as(customerId), order: orderId.toString(), name: "Second", amount: 30}))
            .rejects.toMatchObject({error_code: "milestone_total_exceeds_order_amount"});
    }));

    it("prices add-ons in cents and stores the customer's note", () => asCompany(async () => {
        const listing = await seedListing({price: 10.1});
        const {insertedId: addOn} = await ListingAddOn.collection.insertOne({
            listing, provider: providerId, name: "Rush", price: {amount: 0.2, currency: currencyId}, deliveryDays: 1, company: companyId,
        });

        await new OrderActions().createFromListing({...as(customerId), listing: listing.toString(), addOns: [addOn.toString()], note: "Blue tones"});

        const order = await Order.findOne({listing});
        expect(order!.amount).toBe(10.3);
        expect(order!.note).toBe("Blue tones");
    }));

    it("refuses an add-on priced in another currency", () => asCompany(async () => {
        const listing = await seedListing();
        const {insertedId: addOn} = await ListingAddOn.collection.insertOne({
            listing, provider: providerId, name: "Rush", price: {amount: 5, currency: otherCurrencyId}, company: companyId,
        });
        await expect(new OrderActions().createFromListing({...as(customerId), listing: listing.toString(), addOns: [addOn.toString()]}))
            .rejects.toMatchObject({error_code: "add_on_currency_mismatch"});
    }));
});

describe("listing activation", () => {
    const writer = ["listings[write:title]"];

    it("lets the provider activate a priced listing", () => asCompany(async () => {
        const listing = await seedListing({status: "draft"});
        await new ListingActions().activate({...as(providerId, writer), _id: listing.toString()});
        expect((await Listing.findById(listing))!.status).toBe("active");
    }));

    it("refuses a listing without a price", () => asCompany(async () => {
        const listing = await seedListing({status: "draft", price: undefined});
        await expect(new ListingActions().activate({...as(providerId, writer), _id: listing.toString()}))
            .rejects.toMatchObject({error_code: "listing_price_required"});
    }));

    it("refuses someone else's listing", () => asCompany(async () => {
        const listing = await seedListing({status: "draft"});
        await expect(new ListingActions().activate({...as(strangerId, writer), _id: listing.toString()}))
            .rejects.toMatchObject({error_code: "user_permissions_not_sufficient"});
    }));
});

describe("order auto-complete", {timeout: 30000}, () => {
    const DAY_MS = 24 * 60 * 60 * 1000;

    it("accepts a delivery left unanswered past the window, counted from submission", () => asCompany(async () => {
        const orderId = await seedOrderInProgress(100);
        await new OrderActions().submitDelivery({...as(providerId), _id: orderId.toString(), message: "Done"});
        // Raw write: the model's update middleware keeps createdAt fixed
        await OrderDelivery.collection.updateOne({order: orderId}, {$set: {createdAt: new Date(Date.now() - 4 * DAY_MS)}});

        await runOrderAutoComplete(companyId, logger);

        expect((await Order.findById(orderId))!.status).toBe("completed");
        expect(await escrowBalance(orderId, companyId, {})).toBe(0);
    }));

    it("leaves a fresh delivery alone even when the due date is long past", () => asCompany(async () => {
        const orderId = await seedOrderInProgress(100);
        await Order.updateOne({_id: orderId}, {$set: {deliveryDueDate: new Date(Date.now() - 30 * DAY_MS)}});
        await new OrderActions().submitDelivery({...as(providerId), _id: orderId.toString(), message: "Late but done"});

        await runOrderAutoComplete(companyId, logger);

        expect((await Order.findById(orderId))!.status).toBe("in_progress");
    }));
});

describe("bids and reviews", () => {
    async function seedTaskRequest(): Promise<ObjectId> {
        const {insertedId} = await TaskRequest.collection.insertOne({
            name: "TASK-1", title: "Podcast edit", requester: customerId, category: new ObjectId(),
            budgetMax: 150, currency: currencyId, status: "open",
            expiresAt: new Date(Date.now() + 60 * 60 * 1000), mainImage: new ObjectId(), company: companyId,
        });
        return insertedId;
    }

    it("opens an order for the accepted bid and rejects the others", () => asCompany(async () => {
        const taskRequest = await seedTaskRequest();
        const [winning, losing] = await Bid.insertMany([
            {taskRequest, bidder: providerId, amount: 120, currency: currencyId, proposal: "A", deliveryDays: 5, company: companyId},
            {taskRequest, bidder: strangerId, amount: 90, currency: currencyId, proposal: "B", deliveryDays: 5, company: companyId},
        ]);

        await new BidActions().accept({...as(customerId), _id: winning._id.toString()});

        expect((await Bid.findById(losing._id))!.status).toBe("rejected");
        const order = await Order.findOne({bid: winning._id});
        expect(order!.provider.toString()).toBe(providerId.toString());
        expect(order!.customer.toString()).toBe(customerId.toString());
    }));

    it("lets a bidder withdraw their own pending bid", () => asCompany(async () => {
        const taskRequest = await seedTaskRequest();
        const bid = await Bid.create({taskRequest, bidder: providerId, amount: 100, currency: currencyId, proposal: "A", deliveryDays: 2, company: companyId});
        await new BidActions().reject({...as(providerId), _id: bid._id.toString()});
        expect((await Bid.findById(bid._id))!.status).toBe("rejected");
    }));

    it("stores a review of a task-request order without inventing a listing", () => asCompany(async () => {
        const {insertedId: orderId} = await Order.collection.insertOne({
            name: "ORDER-1", taskRequest: new ObjectId(), customer: customerId, provider: providerId,
            amount: 50, currency: currencyId, status: "completed", company: companyId,
        });
        const review = await Review.create({order: orderId, rating: 5, reviewer: customerId, company: companyId});
        expect(review.listing).toBeUndefined();
    }));
});

describe("marketplace access", () => {
    it("limits non-admins to the orders they are a party to", () => asCompany(async () => {
        await seedOrderInProgress();
        const caller = {userId: strangerId.toString(), isAdmin: false};

        expect(await Order.countDocuments({company: companyId, ...orderPartyFilter(caller)})).toBe(0);
        expect(await Order.countDocuments({company: companyId, ...orderPartyFilter({userId: customerId.toString(), isAdmin: false})})).toBe(1);
        expect(await orderChildFilter(companyId, {userId: providerId.toString(), isAdmin: true}, {})).toEqual({});
    }));
});
