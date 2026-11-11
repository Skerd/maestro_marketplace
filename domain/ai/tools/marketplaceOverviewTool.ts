/**
 * `marketplace_overview` — one-call health check for the service marketplace.
 *
 * Answers "how is the marketplace doing?", "what needs attention?", "give me
 * this month's numbers". Without it the model has to fire five or six search
 * tools and stitch the figures together, which is slow and gives it room to
 * miscount.
 *
 * EVERY FIGURE IS A COUNT OR AN AGGREGATE over the whole company scope — no
 * sampling. Money is grouped by currency and never converted, and the window is
 * explicit so "this month" is never silently assumed.
 *
 * @module marketplaceOverviewTool
 */

import {z} from "zod";
import {registerAssistantTool} from "@coreModule/domain/ai/tools/toolRegistry";
import type {AssistantTool, AssistantToolContext} from "@coreModule/domain/ai/tools/assistantTool.types";
import {accessDenied, requireCompanyAdmin} from "@coreModule/domain/ai/tools/assistantToolAccess";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {orderService} from "@marketplaceModule/database/schemas/order/order.service";
import {taskRequestService} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.service";
import {bidService} from "@marketplaceModule/database/schemas/bid/bid.service";
import {bookingService} from "@marketplaceModule/database/schemas/booking/booking.service";
import {disputeService} from "@marketplaceModule/database/schemas/dispute/dispute.service";
import {providerProfileService} from "@marketplaceModule/database/schemas/providerProfile/providerProfile.service";
import {companyObjectId, companyScope, toAmount} from "@coreModule/domain/ai/tools/assistantToolKit";
import {roundToCurrency} from "armonia/src/modules/core/helpers/money";

/** Default reporting window for the "recent activity" figures. */
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 365;
const MS_PER_DAY = 86_400_000;

const MarketplaceOverviewArgs = z
    .object({
        windowDays: z.coerce.number().int().positive().max(MAX_WINDOW_DAYS).optional()
    })
    .strip();

const parameters = {
    type: "object" as const,
    properties: {
        windowDays: {
            type: "integer",
            description:
                `How many days back the "recent" figures (jobs won, new requests) should cover. ` +
                `Default ${DEFAULT_WINDOW_DAYS}, max ${MAX_WINDOW_DAYS}. Use 30 for "this month", 7 for "this week".`
        }
    },
    required: [] as string[]
};

/** Count jobs by status across the whole company, in one aggregation. */
async function orderBreakdown(ctx: AssistantToolContext): Promise<{total: number; byStatus: Record<string, number>}> {
    const rows: any[] = await orderService.aggregate(
        [
            {$match: {company: companyObjectId(ctx), deletedAt: null}},
            {$group: {_id: "$status", count: {$sum: 1}}}
        ],
        {logger: ctx.logger}
    );

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
        const count = row.count ?? 0;
        byStatus[row._id ?? "unknown"] = count;
        total += count;
    }
    return {total, byStatus};
}

/** Value of jobs completed in the window, grouped by currency. */
async function completedValue(
    since: Date,
    ctx: AssistantToolContext
): Promise<{jobs: number; value: Array<{currency: string | null; amount: number}>}> {
    const rows: any[] = await orderService.aggregate(
        [
            {
                $match: {
                    company: companyObjectId(ctx),
                    deletedAt: null,
                    status: "completed",
                    updatedAt: {$gte: since}
                }
            },
            {$group: {_id: "$currency", amount: {$sum: {$toDouble: "$amount"}}, jobs: {$sum: 1}}},
            {$lookup: {from: "currencies", localField: "_id", foreignField: "_id", as: "currency"}}
        ],
        {logger: ctx.logger}
    );

    return {
        jobs: rows.reduce((sum, row) => sum + (row.jobs ?? 0), 0),
        value: rows.map((row) => ({
            currency: row.currency?.[0]?.abbreviation ?? row.currency?.[0]?.symbol ?? null,
            amount: roundToCurrency(toAmount(row.amount))
        }))
    };
}

async function execute(rawArgs: unknown, ctx: AssistantToolContext): Promise<unknown> {
    // Company-wide figures: non-admins only see their own marketplace records
    const access = await requireCompanyAdmin(ctx);
    if (!access.allowed) return accessDenied("company-wide marketplace figures");

    const args = MarketplaceOverviewArgs.parse(rawArgs ?? {});
    const windowDays = args.windowDays ?? DEFAULT_WINDOW_DAYS;
    const now = new Date();
    const since = new Date(now.getTime() - windowDays * MS_PER_DAY);
    const soon = new Date(now.getTime() + 7 * MS_PER_DAY);

    const scope = companyScope(ctx);
    const countOptions = {logger: ctx.logger, withDeleted: false};

    const [
        orders,
        completed,
        activeListings,
        draftListings,
        activeJobs,
        overdueJobs,
        openRequests,
        requestsExpiringSoon,
        newRequests,
        pendingBids,
        upcomingBookings,
        openDisputes,
        providers,
        providersAwaitingPayoutSetup
    ] = await Promise.all([
        orderBreakdown(ctx),
        completedValue(since, ctx),
        listingService.count({...scope, status: "active"}, countOptions),
        listingService.count({...scope, status: "draft"}, countOptions),
        orderService.count({...scope, status: {$in: ["pending", "accepted", "in_progress"]}}, countOptions),
        orderService.count(
            {...scope, status: {$in: ["pending", "accepted", "in_progress"]}, deliveryDueDate: {$lt: now}},
            countOptions
        ),
        taskRequestService.count({...scope, status: "open"}, countOptions),
        taskRequestService.count({...scope, status: "open", expiresAt: {$gte: now, $lte: soon}}, countOptions),
        taskRequestService.count({...scope, createdAt: {$gte: since}}, countOptions),
        bidService.count({...scope, status: "pending"}, countOptions),
        bookingService.count({...scope, startAt: {$gte: now}}, countOptions),
        disputeService.count({...scope, status: {$in: ["open", "under_review"]}}, countOptions),
        providerProfileService.count(scope, countOptions),
        providerProfileService.count({...scope, stripePayoutsEnabled: {$ne: true}}, countOptions)
    ]);

    return {
        windowDays,
        windowStart: since,
        generatedAt: now,
        supply: {
            activeListings,
            draftListings,
            providers,
            providersAwaitingPayoutSetup
        },
        demand: {
            openTaskRequests: openRequests,
            requestsExpiringWithin7Days: requestsExpiringSoon,
            newRequestsInWindow: newRequests,
            pendingBids
        },
        jobs: {
            active: activeJobs,
            overdue: overdueJobs,
            completedInWindow: completed.jobs,
            // Grouped by currency; do not add these together.
            completedValueInWindow: completed.value,
            allTime: orders.total,
            byStatus: orders.byStatus
        },
        attention: {
            openDisputes,
            overdueJobs,
            upcomingBookings,
            providersAwaitingPayoutSetup
        },
        notes: [
            "All figures are real counts/aggregates over the whole company — not samples.",
            "Completed-job value is grouped by currency and never converted; do not sum across currencies.",
            "Providers awaiting payout setup cannot be paid until they finish payment onboarding.",
            "Use the specific search_* tools to drill into any number above."
        ]
    };
}

export const marketplaceOverviewTool: AssistantTool = {
    name: "marketplace_overview",
    description:
        "Get a single snapshot of the service marketplace: active and draft " +
        "listings, provider count and how many still cannot be paid out, open " +
        "task requests and those expiring soon, pending bids, active and overdue " +
        "jobs, jobs completed and their value in a recent window, upcoming " +
        "bookings and open disputes. Use this FIRST for broad questions like " +
        "\"how is the marketplace doing?\" or \"what needs attention?\" — it " +
        "replaces firing several search tools. Then drill in with the specific " +
        "search_* tools.",
    parameters,
    execute
};

/** Registered by the core tool bootstrap (registerAllAssistantTools). */
export function registerMarketplaceOverviewAssistantTools(): void {
    registerAssistantTool(marketplaceOverviewTool);
}
