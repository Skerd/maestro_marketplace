/**
 * `search_marketplace_orders`, `search_bookings` and `search_disputes` —
 * AI-assistant tools for jobs sold through the service marketplace and what
 * happens while they run.
 *
 * Answers "how many jobs are in progress?", "what did we book this month?",
 * "which jobs are past their delivery date?", "what's scheduled tomorrow?",
 * "are there any open disputes?".
 *
 * VALUE IS AGGREGATED, NOT SUMMED FROM THE PAGE. `results` is a capped sample;
 * `total` and `value` come from separate count/aggregate passes over the full
 * filter, grouped by currency and never converted.
 *
 * SECURITY: arguments are untrusted LLM output — re-validated with Zod, free
 * text regex-escaped, and every query hard-scoped to `ctx.companyId`.
 *
 * @module marketplaceOrderTools
 */

import {ObjectId} from "mongodb";
import {z} from "zod";
import {registerAssistantTool} from "@coreModule/domain/ai/tools/toolRegistry";
import type {AssistantTool, AssistantToolContext} from "@coreModule/domain/ai/tools/assistantTool.types";
import {accessDenied, requirePermission} from "@coreModule/domain/ai/tools/assistantToolAccess";
import {orderService} from "@marketplaceModule/database/schemas/order/order.service";
import {bookingService} from "@marketplaceModule/database/schemas/booking/booking.service";
import {disputeService} from "@marketplaceModule/database/schemas/dispute/dispute.service";
import {orderChildFilter, orderPartyFilter} from "@marketplaceModule/utilities/services/marketplaceAccess";
import type {OrderStatus} from "@marketplaceModule/database/schemas/order/order";
import type {DisputeStatus} from "@marketplaceModule/database/schemas/dispute/dispute";
import {
    DEFAULT_RESULTS,
    companyObjectId,
    companyScope,
    dateRange,
    daysOverdue,
    enumValues,
    findOptions,
    limitArg,
    limitParameter,
    listResult,
    numberRange,
    regexClause,
    shortText,
    toAmount,
    toNumber,
    userDisplayName
} from "@coreModule/domain/ai/tools/assistantToolKit";
import {roundToCurrency} from "armonia/src/modules/core/helpers/money";

const ORDER_STATUS_VALUES = enumValues<OrderStatus>({
    pending: true,
    accepted: true,
    in_progress: true,
    completed: true,
    cancelled: true
});
const DISPUTE_STATUS_VALUES = enumValues<DisputeStatus>({
    open: true,
    under_review: true,
    resolved: true,
    closed: true
});

/** Order statuses where the job is live and can therefore run late. */
const LIVE_ORDER_STATUSES = ["pending", "accepted", "in_progress"];
/** Dispute statuses that still need someone to act. */
const UNRESOLVED_DISPUTE_STATUSES = ["open", "under_review"];

// ── search_marketplace_orders ────────────────────────────────────────────────

const SearchOrdersArgs = z
    .object({
        search: z.string().trim().min(1).optional(),
        status: z.enum(ORDER_STATUS_VALUES as [string, ...string[]]).optional(),
        activeOnly: z.coerce.boolean().optional(),
        overdueOnly: z.coerce.boolean().optional(),
        placedFrom: z.coerce.date().optional(),
        placedTo: z.coerce.date().optional(),
        minAmount: z.coerce.number().nonnegative().optional(),
        maxAmount: z.coerce.number().nonnegative().optional(),
        mineOnly: z.coerce.boolean().optional(),
        limit: limitArg
    })
    .strip();

const orderParameters = {
    type: "object" as const,
    properties: {
        search: {type: "string", description: "Free text matched against the order reference."},
        status: {
            type: "string",
            enum: ORDER_STATUS_VALUES,
            description: "Job status: pending, accepted, in_progress, completed, or cancelled."
        },
        activeOnly: {type: "boolean", description: "true = only live jobs (pending, accepted or in_progress)."},
        overdueOnly: {
            type: "boolean",
            description: "true = only live jobs past their delivery due date. Prefer this for \"what is late\"."
        },
        placedFrom: {type: "string", description: "ISO date; only jobs created on or after this date."},
        placedTo: {type: "string", description: "ISO date; only jobs created on or before this date."},
        minAmount: {type: "number", description: "Minimum job value in the order's own currency."},
        maxAmount: {type: "number", description: "Maximum job value in the order's own currency."},
        mineOnly: {
            type: "boolean",
            description: "true when the user asks about THEIR OWN jobs — as either the buyer or the provider."
        },
        limit: limitParameter
    },
    required: [] as string[]
};

/** Sum job value across the FULL filtered set, grouped by currency. */
async function rollUpValue(
    query: Record<string, unknown>,
    ctx: AssistantToolContext
): Promise<Array<{currency: string | null; amount: number; orders: number}>> {
    const rows: any[] = await orderService.aggregate(
        [
            {$match: {...query, company: companyObjectId(ctx), deletedAt: null}},
            {$group: {_id: "$currency", amount: {$sum: {$toDouble: "$amount"}}, orders: {$sum: 1}}},
            {$lookup: {from: "currencies", localField: "_id", foreignField: "_id", as: "currency"}}
        ],
        {logger: ctx.logger}
    );

    return rows.map((row) => ({
        currency: row.currency?.[0]?.abbreviation ?? row.currency?.[0]?.symbol ?? null,
        amount: roundToCurrency(toAmount(row.amount)),
        orders: row.orders ?? 0
    }));
}

async function executeOrders(rawArgs: unknown, ctx: AssistantToolContext): Promise<unknown> {
    // The assistant shows only what the panel would: the same read permission
    const access = await requirePermission(ctx, "orders[read:amount]");
    if (!access.allowed) return accessDenied("marketplace orders");

    const args = SearchOrdersArgs.parse(rawArgs ?? {});

    // Hard company scope — the only scope the tool is allowed to read.
    const query: Record<string, unknown> = companyScope(ctx);
    // As in the panel, a non-admin only sees the jobs they are a party to
    query.$and = [orderPartyFilter({userId: ctx.userId, isAdmin: access.isAdmin})];

    if (args.search != null) query.name = regexClause(args.search);

    if (args.overdueOnly === true) {
        query.status = {$in: LIVE_ORDER_STATUSES};
        query.deliveryDueDate = {$lt: new Date()};
    } else if (args.activeOnly === true) {
        query.status = {$in: LIVE_ORDER_STATUSES};
    } else if (args.status) {
        query.status = args.status;
    }

    // "My jobs" covers both sides of the deal, scoped from trusted context.
    if (args.mineOnly === true) {
        const me = new ObjectId(ctx.userId);
        query.$or = [{customer: me}, {provider: me}];
    }

    const placed = dateRange(args.placedFrom, args.placedTo);
    if (placed) query.createdAt = placed;

    const amount = numberRange(args.minAmount, args.maxAmount);
    if (amount) query.amount = amount;

    const limit = args.limit ?? DEFAULT_RESULTS;

    const orders = await orderService.find(
        query,
        findOptions(ctx),
        [
            {path: "listing", select: "title name"},
            {path: "taskRequest", select: "title name"},
            {path: "customer", select: "name surname fullName username"},
            {path: "provider", select: "name surname fullName username"},
            {path: "currency", select: "symbol abbreviation name"}
        ],
        "name listing taskRequest customer provider amount currency status deliveryDueDate createdAt",
        {createdAt: -1},
        limit
    );

    const results = orders.map((o: any) => {
        const late = daysOverdue(o.deliveryDueDate);
        const live = LIVE_ORDER_STATUSES.includes(o.status);
        return {
            id: o._id?.toString(),
            reference: o.name ?? null,
            // A job comes either from a listing the buyer picked or from a task
            // request the provider bid on — report whichever applies.
            listing: o.listing?.title ?? o.listing?.name ?? null,
            taskRequest: o.taskRequest?.title ?? o.taskRequest?.name ?? null,
            customer: userDisplayName(o.customer),
            provider: userDisplayName(o.provider),
            amount: toNumber(o.amount),
            currency: o.currency?.abbreviation || o.currency?.symbol || null,
            status: o.status ?? null,
            deliveryDueDate: o.deliveryDueDate ?? null,
            daysLate: live && late != null && late > 0 ? late : 0,
            createdAt: o.createdAt ?? null
        };
    });

    const envelope = await listResult(orderService, query, results, ctx);
    const value = await rollUpValue(query, ctx);

    return {...envelope, value};
}

export const searchMarketplaceOrdersTool: AssistantTool = {
    name: "search_marketplace_orders",
    description:
        "Search jobs sold through the service marketplace. Filter by reference, " +
        "status (pending, accepted, in_progress, completed, cancelled), " +
        "`activeOnly`, `overdueOnly` for jobs past their delivery date, a creation " +
        "date range, an amount range, or `mineOnly` for the caller's own jobs as " +
        "buyer or provider. Returns each job's listing or task request, buyer, " +
        "provider, amount, status and days late, plus `total` (the true number of " +
        "matching jobs) and `value` — the summed value across ALL matches, grouped " +
        "by currency. This is the SERVICE marketplace; for retail shop orders use " +
        "search_product_orders.",
    parameters: orderParameters,
    execute: executeOrders
};

// ── search_bookings ──────────────────────────────────────────────────────────

const SearchBookingsArgs = z
    .object({
        startsFrom: z.coerce.date().optional(),
        startsTo: z.coerce.date().optional(),
        upcomingOnly: z.coerce.boolean().optional(),
        mineOnly: z.coerce.boolean().optional(),
        limit: limitArg
    })
    .strip();

const bookingParameters = {
    type: "object" as const,
    properties: {
        startsFrom: {type: "string", description: "ISO date; only bookings starting on or after this date."},
        startsTo: {type: "string", description: "ISO date; only bookings starting on or before this date."},
        upcomingOnly: {type: "boolean", description: "true = only bookings that have not started yet."},
        mineOnly: {type: "boolean", description: "true when the user asks about bookings where THEY are the provider."},
        limit: limitParameter
    },
    required: [] as string[]
};

async function executeBookings(rawArgs: unknown, ctx: AssistantToolContext): Promise<unknown> {
    // The assistant shows only what the panel would: the same read permission
    const access = await requirePermission(ctx, "bookings[read:startAt]");
    if (!access.allowed) return accessDenied("bookings");

    const args = SearchBookingsArgs.parse(rawArgs ?? {});

    // Hard company scope — the only scope the tool is allowed to read.
    const query: Record<string, unknown> = companyScope(ctx);
    // As in the panel, a non-admin only sees the bookings of their own jobs
    query.$and = [await orderChildFilter(companyObjectId(ctx), {userId: ctx.userId, isAdmin: access.isAdmin}, findOptions(ctx))];

    if (args.upcomingOnly === true) {
        query.startAt = {$gte: new Date()};
    } else {
        const starts = dateRange(args.startsFrom, args.startsTo);
        if (starts) query.startAt = starts;
    }
    if (args.mineOnly === true) query.provider = new ObjectId(ctx.userId);

    const limit = args.limit ?? DEFAULT_RESULTS;

    const bookings = await bookingService.find(
        query,
        findOptions(ctx),
        [
            {path: "order", select: "name status amount"},
            {path: "provider", select: "name surname fullName username"}
        ],
        "order provider startAt endAt timezone",
        {startAt: 1},
        limit
    );

    const results = bookings.map((b: any) => ({
        id: b._id?.toString(),
        orderReference: b.order?.name ?? null,
        orderStatus: b.order?.status ?? null,
        provider: userDisplayName(b.provider),
        startAt: b.startAt ?? null,
        endAt: b.endAt ?? null,
        timezone: b.timezone ?? null,
        inPast: b.endAt != null && new Date(b.endAt) < new Date()
    }));

    return listResult(bookingService, query, results, ctx);
}

export const searchBookingsTool: AssistantTool = {
    name: "search_bookings",
    description:
        "Search scheduled appointments booked against marketplace jobs. Filter by " +
        "a start-date range, `upcomingOnly`, or `mineOnly` for bookings where the " +
        "caller is the provider. Returns each booking's job reference, provider, " +
        "start and end time and timezone, plus `total` — the true number of " +
        "matching bookings. Use this for \"what is scheduled\", \"what's on " +
        "tomorrow\", or a provider's calendar.",
    parameters: bookingParameters,
    execute: executeBookings
};

// ── search_disputes ──────────────────────────────────────────────────────────

const SearchDisputesArgs = z
    .object({
        search: z.string().trim().min(1).optional(),
        status: z.enum(DISPUTE_STATUS_VALUES as [string, ...string[]]).optional(),
        openOnly: z.coerce.boolean().optional(),
        limit: limitArg
    })
    .strip();

const disputeParameters = {
    type: "object" as const,
    properties: {
        search: {type: "string", description: "Free text matched against the dispute reason or resolution."},
        status: {
            type: "string",
            enum: DISPUTE_STATUS_VALUES,
            description: "Dispute status: open, under_review, resolved, or closed."
        },
        openOnly: {type: "boolean", description: "true = only disputes still needing action (open or under_review)."},
        limit: limitParameter
    },
    required: [] as string[]
};

async function executeDisputes(rawArgs: unknown, ctx: AssistantToolContext): Promise<unknown> {
    // The assistant shows only what the panel would: the same read permission
    const access = await requirePermission(ctx, "disputes[read:reason]");
    if (!access.allowed) return accessDenied("disputes");

    const args = SearchDisputesArgs.parse(rawArgs ?? {});

    // Hard company scope — the only scope the tool is allowed to read.
    const query: Record<string, unknown> = companyScope(ctx);
    // As in the panel, a non-admin only sees the disputes on their own jobs
    query.$and = [await orderChildFilter(companyObjectId(ctx), {userId: ctx.userId, isAdmin: access.isAdmin}, findOptions(ctx))];

    if (args.search != null) {
        const rx = regexClause(args.search);
        query.$or = [{reason: rx}, {resolution: rx}];
    }
    if (args.openOnly === true) {
        query.status = {$in: UNRESOLVED_DISPUTE_STATUSES};
    } else if (args.status) {
        query.status = args.status;
    }

    const limit = args.limit ?? DEFAULT_RESULTS;

    const disputes = await disputeService.find(
        query,
        findOptions(ctx),
        [
            {path: "order", select: "name status amount"},
            {path: "initiator", select: "name surname fullName username"}
        ],
        "order initiator reason status resolution createdAt",
        {createdAt: -1},
        limit
    );

    const results = disputes.map((d: any) => ({
        id: d._id?.toString(),
        orderReference: d.order?.name ?? null,
        orderStatus: d.order?.status ?? null,
        orderAmount: toNumber(d.order?.amount),
        initiator: userDisplayName(d.initiator),
        status: d.status ?? null,
        reason: shortText(d.reason, 300),
        resolution: shortText(d.resolution, 300),
        raisedAt: d.createdAt ?? null,
        openDays: UNRESOLVED_DISPUTE_STATUSES.includes(d.status) ? daysOverdue(d.createdAt) ?? 0 : 0
    }));

    return listResult(disputeService, query, results, ctx);
}

export const searchDisputesTool: AssistantTool = {
    name: "search_disputes",
    description:
        "Search disputes raised against marketplace jobs. Filter by free text " +
        "over the reason or resolution, status (open, under_review, resolved, " +
        "closed), or `openOnly` for those still needing action. Returns each " +
        "dispute's job, who raised it, the reason, the resolution and how many " +
        "days it has been open, plus `total` — the true number of matching " +
        "disputes. Use this for questions about complaints, disputes or conflicts " +
        "between buyers and providers.",
    parameters: disputeParameters,
    execute: executeDisputes
};

/** Registered by the core tool bootstrap (registerAllAssistantTools). */
export function registerMarketplaceOrderAssistantTools(): void {
    registerAssistantTool(searchMarketplaceOrdersTool);
    registerAssistantTool(searchBookingsTool);
    registerAssistantTool(searchDisputesTool);
}
