/**
 * `search_task_requests` + `search_bids` — AI-assistant tools for the demand
 * side of the marketplace: buyers posting work, and providers quoting for it.
 *
 * Answers "what jobs are open for quotes?", "which requests expire this week?",
 * "how many bids came in on request X?", "what's the cheapest quote we got?".
 *
 * SECURITY: arguments are untrusted LLM output — re-validated with Zod, free
 * text regex-escaped, and every query hard-scoped to `ctx.companyId`. A
 * model-supplied request reference is resolved to an id inside that scope first,
 * so it cannot reach another tenant's bids.
 *
 * @module demandTools
 */

import {ObjectId} from "mongodb";
import {z} from "zod";
import {registerAssistantTool} from "@coreModule/domain/ai/tools/toolRegistry";
import type {AssistantTool, AssistantToolContext} from "@coreModule/domain/ai/tools/assistantTool.types";
import {accessDenied, requirePermission} from "@coreModule/domain/ai/tools/assistantToolAccess";
import {taskRequestService} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.service";
import {bidService} from "@marketplaceModule/database/schemas/bid/bid.service";
import {bidVisibilityFilter} from "@marketplaceModule/utilities/services/marketplaceAccess";
import {listingCategoryService} from "@marketplaceModule/database/schemas/listingCategory/listingCategory.service";
import type {TaskRequestStatus} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import type {BidStatus} from "@marketplaceModule/database/schemas/bid/bid";
import {
    DEFAULT_RESULTS,
    companyObjectId,
    companyScope,
    dateRange,
    emptyResult,
    enumValues,
    findOptions,
    limitArg,
    limitParameter,
    listResult,
    numberRange,
    regexClause,
    shortText,
    toNumber,
    userDisplayName
} from "@coreModule/domain/ai/tools/assistantToolKit";

const TASK_STATUS_VALUES = enumValues<TaskRequestStatus>({open: true, closed: true, awarded: true});
const BID_STATUS_VALUES = enumValues<BidStatus>({pending: true, accepted: true, rejected: true});

// ── search_task_requests ─────────────────────────────────────────────────────

const SearchTaskRequestsArgs = z
    .object({
        search: z.string().trim().min(1).optional(),
        categoryName: z.string().trim().min(1).optional(),
        status: z.enum(TASK_STATUS_VALUES as [string, ...string[]]).optional(),
        openOnly: z.coerce.boolean().optional(),
        expiringBefore: z.coerce.date().optional(),
        minBudget: z.coerce.number().nonnegative().optional(),
        maxBudget: z.coerce.number().nonnegative().optional(),
        mineOnly: z.coerce.boolean().optional(),
        limit: limitArg
    })
    .strip();

const taskParameters = {
    type: "object" as const,
    properties: {
        search: {type: "string", description: "Free text matched against the request title or description."},
        categoryName: {type: "string", description: "Only requests in the category whose name matches this."},
        status: {
            type: "string",
            enum: TASK_STATUS_VALUES,
            description: "Request status: open (taking bids), closed, or awarded."
        },
        openOnly: {type: "boolean", description: "true = only requests still open for quotes."},
        expiringBefore: {
            type: "string",
            description: "ISO date; only requests expiring on or before this date. Use for \"what closes soon\"."
        },
        minBudget: {type: "number", description: "Only requests whose maximum budget is at least this."},
        maxBudget: {type: "number", description: "Only requests whose minimum budget is at most this."},
        mineOnly: {type: "boolean", description: "true when the user asks about requests THEY posted."},
        limit: limitParameter
    },
    required: [] as string[]
};

async function executeTaskRequests(rawArgs: unknown, ctx: AssistantToolContext): Promise<unknown> {
    // The assistant shows only what the panel would: the same read permission
    const access = await requirePermission(ctx, "taskrequests[read:title]");
    if (!access.allowed) return accessDenied("task requests");

    const args = SearchTaskRequestsArgs.parse(rawArgs ?? {});

    // Hard company scope — the only scope the tool is allowed to read.
    const query: Record<string, unknown> = companyScope(ctx);

    if (args.categoryName != null) {
        const categories = await listingCategoryService.find(
            {...companyScope(ctx), name: regexClause(args.categoryName)},
            findOptions(ctx),
            undefined,
            "_id",
            undefined,
            25
        );
        const categoryIds = categories.map((c: any) => c._id).filter(Boolean);
        if (categoryIds.length === 0) {
            return emptyResult(`No listing category matching "${args.categoryName}" in this company.`);
        }
        query.category = {$in: categoryIds};
    }

    if (args.search != null) {
        const rx = regexClause(args.search);
        query.$or = [{title: rx}, {description: rx}, {name: rx}];
    }
    if (args.openOnly === true) {
        query.status = "open";
    } else if (args.status) {
        query.status = args.status;
    }
    if (args.expiringBefore != null) query.expiresAt = {$lte: args.expiringBefore};
    if (args.mineOnly === true) query.requester = new ObjectId(ctx.userId);

    // A request states a budget band, so "at least X" means its ceiling reaches
    // X, and "at most Y" means its floor sits under Y — the bands overlap the
    // asked-for range rather than sitting inside it.
    if (args.minBudget != null) query.budgetMax = {$gte: args.minBudget};
    if (args.maxBudget != null) query.budgetMin = {$lte: args.maxBudget};

    const limit = args.limit ?? DEFAULT_RESULTS;

    const requests = await taskRequestService.find(
        query,
        findOptions(ctx),
        [
            {path: "requester", select: "name surname fullName username"},
            {path: "category", select: "name slug"},
            {path: "currency", select: "symbol abbreviation name"},
            {path: "address.city", select: "name"},
            {path: "address.country", select: "name"}
        ],
        "name title description requester category budgetMin budgetMax currency status expiresAt address createdAt",
        {expiresAt: 1},
        limit
    );

    // Bid counts for the page, in one grouped query rather than one per row.
    const requestIds = requests.map((r: any) => r._id).filter(Boolean);
    const bidCounts = new Map<string, {count: number; lowest: number | null}>();
    if (requestIds.length > 0) {
        const rows: any[] = await bidService.aggregate(
            [
                {$match: {company: companyObjectId(ctx), deletedAt: null, taskRequest: {$in: requestIds}}},
                {$group: {_id: "$taskRequest", count: {$sum: 1}, lowest: {$min: {$toDouble: "$amount"}}}}
            ],
            {logger: ctx.logger}
        );
        for (const row of rows) {
            bidCounts.set(row._id?.toString(), {count: row.count ?? 0, lowest: row.lowest ?? null});
        }
    }

    const results = requests.map((r: any) => {
        const bids = bidCounts.get(r._id?.toString()) ?? {count: 0, lowest: null};
        return {
            id: r._id?.toString(),
            reference: r.name ?? null,
            title: r.title ?? null,
            description: shortText(r.description, 200),
            requester: userDisplayName(r.requester),
            category: r.category?.name ?? null,
            budgetMin: toNumber(r.budgetMin),
            budgetMax: toNumber(r.budgetMax),
            currency: r.currency?.abbreviation || r.currency?.symbol || null,
            status: r.status ?? null,
            expiresAt: r.expiresAt ?? null,
            location: [r.address?.city?.name, r.address?.country?.name].filter(Boolean).join(", ") || null,
            bidCount: bids.count,
            lowestBid: bids.lowest,
            postedAt: r.createdAt ?? null
        };
    });

    return listResult(taskRequestService, query, results, ctx);
}

export const searchTaskRequestsTool: AssistantTool = {
    name: "search_task_requests",
    description:
        "Search task requests — jobs buyers have posted for providers to quote " +
        "on. Filter by free text, category, status (open, closed, awarded), " +
        "`openOnly`, an expiry cut-off, a budget range, or `mineOnly` for requests " +
        "the caller posted. Returns each request's title, requester, budget band, " +
        "expiry, location, how many bids it has received and the lowest bid, plus " +
        "`total` — the true number of matching requests. Use this for \"what work " +
        "is up for quote\", \"which requests close soon\", or \"what needs bids\".",
    parameters: taskParameters,
    execute: executeTaskRequests
};

// ── search_bids ──────────────────────────────────────────────────────────────

const SearchBidsArgs = z
    .object({
        taskRequestReference: z.string().trim().min(1).optional(),
        status: z.enum(BID_STATUS_VALUES as [string, ...string[]]).optional(),
        minAmount: z.coerce.number().nonnegative().optional(),
        maxAmount: z.coerce.number().nonnegative().optional(),
        maxDeliveryDays: z.coerce.number().int().positive().optional(),
        mineOnly: z.coerce.boolean().optional(),
        since: z.coerce.date().optional(),
        limit: limitArg
    })
    .strip();

const bidParameters = {
    type: "object" as const,
    properties: {
        taskRequestReference: {
            type: "string",
            description: "Only bids on the task request whose reference or title matches this."
        },
        status: {
            type: "string",
            enum: BID_STATUS_VALUES,
            description: "Bid status: pending, accepted, or rejected."
        },
        minAmount: {type: "number", description: "Minimum quoted amount in the bid's own currency."},
        maxAmount: {type: "number", description: "Maximum quoted amount in the bid's own currency."},
        maxDeliveryDays: {type: "integer", description: "Only bids promising delivery within this many days."},
        mineOnly: {type: "boolean", description: "true when the user asks about bids THEY submitted."},
        since: {type: "string", description: "ISO date; only bids submitted on or after this date."},
        limit: limitParameter
    },
    required: [] as string[]
};

async function executeBids(rawArgs: unknown, ctx: AssistantToolContext): Promise<unknown> {
    // The assistant shows only what the panel would: the same read permission
    const access = await requirePermission(ctx, "marketplacebids[read:amount]");
    if (!access.allowed) return accessDenied("bids");

    const args = SearchBidsArgs.parse(rawArgs ?? {});

    // Hard company scope — the only scope the tool is allowed to read.
    const query: Record<string, unknown> = companyScope(ctx);
    // As in the panel, a non-admin only sees their own bids and the bids on their own requests
    query.$and = [await bidVisibilityFilter(companyObjectId(ctx), {userId: ctx.userId, isAdmin: access.isAdmin}, findOptions(ctx))];

    if (args.taskRequestReference != null) {
        const rx = regexClause(args.taskRequestReference);
        const requests = await taskRequestService.find(
            {...companyScope(ctx), $or: [{name: rx}, {title: rx}]},
            findOptions(ctx),
            undefined,
            "_id",
            undefined,
            25
        );
        const requestIds = requests.map((r: any) => r._id).filter(Boolean);
        if (requestIds.length === 0) {
            return emptyResult(`No task request matching "${args.taskRequestReference}" in this company.`);
        }
        query.taskRequest = {$in: requestIds};
    }

    if (args.status) query.status = args.status;
    if (args.maxDeliveryDays != null) query.deliveryDays = {$lte: args.maxDeliveryDays};
    if (args.mineOnly === true) query.bidder = new ObjectId(ctx.userId);

    const amount = numberRange(args.minAmount, args.maxAmount);
    if (amount) query.amount = amount;

    const when = dateRange(args.since, undefined);
    if (when) query.createdAt = when;

    const limit = args.limit ?? DEFAULT_RESULTS;

    const bids = await bidService.find(
        query,
        findOptions(ctx),
        [
            {path: "taskRequest", select: "name title status"},
            {path: "bidder", select: "name surname fullName username"},
            {path: "currency", select: "symbol abbreviation name"}
        ],
        "name taskRequest bidder amount currency proposal deliveryDays status createdAt",
        {amount: 1},
        limit
    );

    const results = bids.map((b: any) => ({
        id: b._id?.toString(),
        reference: b.name ?? null,
        taskRequest: b.taskRequest?.title ?? b.taskRequest?.name ?? null,
        taskRequestStatus: b.taskRequest?.status ?? null,
        bidder: userDisplayName(b.bidder),
        amount: toNumber(b.amount),
        currency: b.currency?.abbreviation || b.currency?.symbol || null,
        deliveryDays: b.deliveryDays ?? null,
        status: b.status ?? null,
        proposal: shortText(b.proposal, 250),
        submittedAt: b.createdAt ?? null
    }));

    return listResult(bidService, query, results, ctx);
}

export const searchBidsTool: AssistantTool = {
    name: "search_bids",
    description:
        "Search bids (quotes) providers have submitted against task requests. " +
        "Filter by the task request, status (pending, accepted, rejected), a " +
        "quoted-amount range, maximum delivery days, `mineOnly` for the caller's " +
        "own bids, or a submission date. Results are ordered cheapest first. " +
        "Returns each bid's request, bidder, amount, delivery time and proposal, " +
        "plus `total` — the true number of matching bids. Use this for \"what " +
        "quotes did we get\", \"cheapest bid\", or \"which of my bids were " +
        "accepted\".",
    parameters: bidParameters,
    execute: executeBids
};

/** Registered by the core tool bootstrap (registerAllAssistantTools). */
export function registerDemandAssistantTools(): void {
    registerAssistantTool(searchTaskRequestsTool);
    registerAssistantTool(searchBidsTool);
}
