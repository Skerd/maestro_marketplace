import type {ObjectId} from "mongodb";
import {registerPortalProvider} from "@coreModule/domain/portal/portalProviderRegistry";
import type {PortalBrowseParams, PortalNewSinceContext} from "@coreModule/domain/portal/portalProvider.types";
import {catalogItems, filterValue, newSinceClause, priceRange} from "@coreModule/domain/portal/portalCatalog";
import type {PortalScope} from "@coreModule/utilities/marketing/portalCompanies";
import {publicMediaUrl} from "@coreModule/utilities/media/publicMediaUrl";
import {PORTAL_CURRENCY_SELECT} from "@coreModule/utilities/mappers/portal/portalStorefrontMapper.dto";
import {companyService} from "@coreModule/database/schemas/company/company.service";
import {currencyService} from "@coreModule/database/schemas/currency/currency.service";
import {isModuleEnabledForCompany} from "@coreModule/utilities/modules/companyModules";
import {taskRequestService} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.service";
import {findMarketplaceOperatorId} from "@marketplaceModule/utilities/services/marketplaceOperator";
import {openPublicTaskFilter, openTaskClause, publicTaskClause} from "@marketplaceModule/utilities/services/publicTasks";

type CatalogTask = {
    _id: ObjectId;
    company: ObjectId;
    title: string;
    mainImage?: ObjectId;
    budgetMax?: number;
    currency?: {abbreviation?: string};
    address?: {city?: {name?: string}};
    category?: {name?: string};
};

/** A task's price is its "up to" budget (D146). */
const TASK_SORT_SPECS: Record<string, Record<string, 1 | -1>> = {
    newest: {createdAt: -1},
    priceAsc: {budgetMax: 1, createdAt: -1},
    priceDesc: {budgetMax: -1, createdAt: -1},
};

/**
 * The task board belongs to the operator (D172): on the apex and on the operator's own site, while the operator is
 * active with the module; no other company's site has one.
 */
async function taskBoardCompanyIds(scope: PortalScope): Promise<ObjectId[]> {
    const operatorId = await findMarketplaceOperatorId();
    if (!operatorId || (scope.companyId && !operatorId.equals(scope.companyId))) return [];
    const operator = await companyService.findById(operatorId, {}, [], "isActive modules");
    return operator?.isActive === true && isModuleEnabledForCompany(operator, "marketplace") ? [operatorId] : [];
}

/** The cities of the open public tasks, for the cards and the "where" filter. */
async function taskCities(companyIds: ObjectId[]): Promise<Map<string, string[]>> {
    const [operatorId] = companyIds;
    if (!operatorId) return new Map();
    const tasks = await taskRequestService.find(
        {...publicTaskClause(operatorId), ...openTaskClause()},
        {withDeleted: false},
        {path: "address.city", select: "name"},
        "address.city",
    );
    const names = new Set(tasks.flatMap((task) => task.address?.city?.name ? [task.address.city.name] : []));
    return new Map([[operatorId.toString(), [...names]]]);
}

/**
 * Budgets mean nothing across currencies, so a budget filter or sort compares the tasks in one currency only: the one
 * the visitor picked (`f.currency`), else the one most of the matching tasks use.
 */
async function comparableCurrencyIds(filter: Record<string, unknown>, picked?: string): Promise<ObjectId[]> {
    const code = picked?.toUpperCase() ?? (await taskRequestService.aggregate([
        {$match: filter},
        {$group: {_id: "$currency", count: {$sum: 1}}},
        {$lookup: {from: "currencies", localField: "_id", foreignField: "_id", as: "currency"}},
        {$unwind: "$currency"},
        {$sort: {count: -1, "currency.abbreviation": 1}},
        {$limit: 1},
    ]))[0]?.currency?.abbreviation;
    if (!code) return [];
    const currencies = await currencyService.find({abbreviation: code}, {withDeleted: false}, null, "_id");
    return currencies.map((currency) => currency._id);
}

/**
 * Open public tasks (D172), with the shared category filter (`f.category`), on-site or online (`f.delivery`);
 * `narrowing` keeps only the tasks a "new since" ask is about.
 */
async function browseTasks({companyIds, query, city, priceMin, priceMax, sort, skip, limit, filters}: PortalBrowseParams, narrowing: Record<string, unknown> = {}) {
    const [operatorId] = companyIds;
    if (!operatorId) return {items: [], total: 0};
    const filter = await openPublicTaskFilter(operatorId, {
        search: query, categorySlug: filterValue(filters, "category"), delivery: filterValue(filters, "delivery"), city,
    });
    if (!filter) return {items: [], total: 0};
    Object.assign(filter, narrowing);
    const budget = priceRange(priceMin, priceMax);
    if (budget || sort === "priceAsc" || sort === "priceDesc") {
        // The common currency of the tasks the other filters keep, before the budget range narrows them.
        filter.currency = {$in: await comparableCurrencyIds(filter, filterValue(filters, "currency"))};
    }
    if (budget) filter.budgetMax = budget;

    const [tasks, total] = await Promise.all([
        taskRequestService.findCatalogRows<CatalogTask>(filter, {
            select: "company title mainImage budgetMax currency address.city category createdAt",
            populate: [{path: "category", select: "name"}, {path: "currency", select: PORTAL_CURRENCY_SELECT}, {path: "address.city", select: "name"}],
            sort: TASK_SORT_SPECS[sort ?? "newest"] ?? TASK_SORT_SPECS.newest,
            skip,
            limit,
        }),
        taskRequestService.count(filter, {withDeleted: false}),
    ]);
    const items = await catalogItems(tasks, (task) => ({
        kind: "task",
        id: task._id.toString(),
        title: task.title,
        subtitle: task.category?.name,
        image: publicMediaUrl(task.mainImage),
        ...(task.budgetMax != null && task.currency?.abbreviation ? {price: {amount: task.budgetMax, currency: task.currency.abbreviation, upTo: true}} : {}),
        city: task.address?.city?.name,
        section: "tasks",
        path: `/task?${new URLSearchParams({id: task._id.toString()})}`,
    }));
    return {items, total};
}

/** The tasks section of the portal (D172): the public task board, on the apex and the operator's own site. */
export function registerTasksPortalProvider(): void {
    registerPortalProvider({
        key: "tasks",
        order: 16,
        kinds: ["task"],
        companyIds: taskBoardCompanyIds,
        citiesByCompany: taskCities,
        browse: (params) => browseTasks(params),
        // Tasks posted after the date (D178): a saved search's alert, a person's kept items.
        newSince: (context: PortalNewSinceContext) => browseTasks({...context, sort: "newest", skip: 0}, newSinceClause(context)),
    });
}
