import type {ObjectId} from "mongodb";
import {minorToNumber, prorateMinor, sumMinor, toMinor} from "armonia/src/modules/core/helpers/money";
import type {PublicTask, PublicTaskQuotes} from "armonia/src/modules/marketplace/api/marketplace/public/shopTask/shopTask.types";
import type {PortalSeller} from "armonia/src/modules/core/api/portal/public/portal/portal.dto";
import {toPortalSeller} from "@coreModule/utilities/mappers/portal/portalStorefrontMapper.dto";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import type {CrudOptions} from "@coreModule/database/services/baseCrudService";
import type {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import {escapeRegex} from "@coreModule/utilities/helpers";
import {cityService} from "@coreModule/database/schemas/city/city.service";
import {bidService} from "@marketplaceModule/database/schemas/bid/bid.service";
import {listingCategoryService} from "@marketplaceModule/database/schemas/listingCategory/listingCategory.service";
import {taskLeadJobToDTO} from "@marketplaceModule/utilities/mappers/taskLead/taskLeadMapper.dto";
import {marketplaceCategoryClause} from "@marketplaceModule/utilities/services/marketplaceOperator";
import {listingCategoryScope, listingCategoryScopeById} from "@marketplaceModule/utilities/shop/shopMarketplaceFilter";

const QUOTES_REASON = "the public task board counts every company's quotes on the operator's tasks (D172)";

/** Quotes that still count on a task: waiting for the buyer, or the one that won. */
const LIVE_QUOTE_STATUSES = ["pending", "accepted"];

/**
 * The average shows from three quotes on (D172): with one it is that quote's price, and with two either bidder could
 * work out the other's from their own. Below it, only the count.
 */
export const MIN_QUOTES_FOR_AVERAGE = 3;

/**
 * The operator's tasks the public may see (D172): every one except those posted on a provider's own site, which stay
 * between the buyer and that provider (D143).
 */
export function publicTaskClause(operatorId: ObjectId): Record<string, unknown> {
    return {company: operatorId, restrictedToCompany: null};
}

/** Tasks still taking quotes: open and not past their expiry (the daily sweep closes them a little later). */
export function openTaskClause(now: Date = new Date()): Record<string, unknown> {
    return {status: "open", expiresAt: {$gt: now}};
}

/** What a task board is narrowed by, on the portal and in the panel alike (D172). */
export type TaskBoardQuery = {
    search?: string;
    /** A category slug of the shared tree; its sub-categories are included. */
    categorySlug?: string;
    /** The same by the category's id (the panel's pickers). */
    categoryId?: string;
    /** `onsite`: work done on site; `remote`: online work (also a category with no delivery set). */
    delivery?: string;
    /** Part of a city's name. */
    city?: string;
};

/** Categories of the shared tree (D144) done on site (`onsite`) or online (`remote`, also when unset). */
async function deliveryCategoryIds(delivery: string): Promise<ObjectId[]> {
    const clause = {...await marketplaceCategoryClause(), delivery: delivery === "onsite" ? "onsite" : {$ne: "onsite"}};
    const categories = await listingCategoryService.find(clause, {withDeleted: false}, null, "_id");
    return categories.map((category) => category._id);
}

/** The open public tasks a board query keeps (D172); null when its category slug matches nothing (an empty board). */
export async function openPublicTaskFilter(operatorId: ObjectId, query: TaskBoardQuery): Promise<Record<string, unknown> | null> {
    const filter: Record<string, unknown> = {...publicTaskClause(operatorId), ...openTaskClause()};
    const and: Record<string, unknown>[] = [];
    if (query.categorySlug || query.categoryId) {
        const scope = query.categorySlug ? await listingCategoryScope(query.categorySlug) : await listingCategoryScopeById(query.categoryId ?? "");
        if (!scope) return null;
        and.push({category: {$in: scope}});
    }
    if (query.delivery === "onsite" || query.delivery === "remote") and.push({category: {$in: await deliveryCategoryIds(query.delivery)}});
    if (query.search) {
        const term = escapeRegex(query.search);
        and.push({$or: [{title: {$regex: term, $options: "i"}}, {description: {$regex: term, $options: "i"}}]});
    }
    if (query.city) {
        const cities = await cityService.find({name: {$regex: escapeRegex(query.city), $options: "i"}}, {withDeleted: false}, null, "_id");
        and.push({"address.city": {$in: cities.map((city) => city._id)}});
    }
    if (and.length) filter.$and = and;
    return filter;
}

/**
 * How many quotes each task has and, from `MIN_QUOTES_FOR_AVERAGE`, their average price, in the task's own currency
 * (every quote on a task is in it, `jobBidData`). Amounts are summed and divided as exact minor units and rounded once (GLB-08).
 */
export async function taskQuoteStats(tasks: {_id?: ObjectId; currency?: {decimalPlaces?: number} | null}[], options: CrudOptions = {}): Promise<Map<string, PublicTaskQuotes>> {
    const stats = new Map<string, PublicTaskQuotes>(tasks.map((task) => [String(task._id), {count: 0}]));
    if (!tasks.length) return stats;
    const bids = await asCrossTenant(QUOTES_REASON, () => bidService.find(
        {taskRequest: {$in: tasks.map((task) => task._id)}, status: {$in: LIVE_QUOTE_STATUSES}},
        {...options, withDeleted: false},
        null,
        "taskRequest amount",
    ));
    const amountsByTask = new Map<string, number[]>();
    for (const bid of bids) {
        const taskId = nestedEntityToRef(bid.taskRequest)?.toString();
        if (taskId) amountsByTask.set(taskId, [...(amountsByTask.get(taskId) ?? []), bid.amount]);
    }
    for (const task of tasks) {
        const amounts = amountsByTask.get(String(task._id)) ?? [];
        if (!amounts.length) continue;
        if (amounts.length < MIN_QUOTES_FOR_AVERAGE) {
            stats.set(String(task._id), {count: amounts.length});
            continue;
        }
        const decimals = task.currency?.decimalPlaces ?? undefined;
        const total = sumMinor(amounts.map((amount) => toMinor(amount, decimals)));
        stats.set(String(task._id), {count: amounts.length, average: minorToNumber(prorateMinor(total, [1], amounts.length), decimals)});
    }
    return stats;
}

/** The company fields a seller card needs (name, logo, own site), as the other storefront pages populate them. */
export const TASK_SELLER_SELECT = "name logo siteSlug siteHost";

/**
 * The companies whose quote on a task is still in play (D172), oldest first, for the task page's "Companies that
 * quoted": who they are and where their site is, never what they asked.
 */
export async function taskQuotingCompanies(taskId: ObjectId, options: CrudOptions = {}): Promise<PortalSeller[]> {
    const bids = await asCrossTenant(QUOTES_REASON, () => bidService.find(
        {taskRequest: taskId, status: {$in: LIVE_QUOTE_STATUSES}},
        {...options, withDeleted: false},
        [{path: "bidderCompany", select: TASK_SELLER_SELECT}],
        "bidderCompany createdAt",
        {createdAt: 1},
    ));
    const sellers = new Map<string, PortalSeller>();
    for (const bid of bids) {
        const seller = toPortalSeller(bid.bidderCompany);
        if (seller && !sellers.has(seller._id)) sellers.set(seller._id, seller);
    }
    return [...sellers.values()];
}

/**
 * A task as everyone may see it (D172): the job a provider sees before the award (city level, the approximate area,
 * D143/D148), without the buyer, and with its quotes' count and average.
 */
export function toPublicTask(task: ITaskRequest, quotes: PublicTaskQuotes): PublicTask {
    const {address, ...job} = taskLeadJobToDTO(task, null);
    // Never filled without an award, and never public even then.
    delete job.requester;
    return {
        ...job,
        ...(address ? {address: {country: address.country, state: address.state, city: address.city}} : {}),
        quotes,
    };
}
