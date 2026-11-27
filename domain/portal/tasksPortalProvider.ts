import {findPlatformCompanyId} from "@coreModule/utilities/security/platformAccess";
import type {ObjectId} from "mongodb";
import {registerPortalProvider} from "@coreModule/domain/portal/portalProviderRegistry";
import type {PortalBrowseParams, PortalNewSinceContext} from "@coreModule/domain/portal/portalProvider.types";
import {catalogItems, filterValue, idClause, itemPagePath, newSinceClause, priceRange} from "@coreModule/domain/portal/portalCatalog";
import type {PortalScope} from "@coreModule/utilities/marketing/portalCompanies";
import {publicMediaUrl} from "@coreModule/utilities/media/publicMediaUrl";
import {PORTAL_CURRENCY_SELECT} from "@coreModule/utilities/mappers/portal/portalStorefrontMapper.dto";
import {currencyService} from "@coreModule/database/schemas/currency/currency.service";
import {taskRequestService} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.service";

import {openPublicTaskFilter, openTaskClause, publicTaskClause} from "@marketplaceModule/utilities/services/publicTasks";
import {listDisplayName, type ListNames} from "@coreModule/utilities/helpers/listNames";

type CatalogTask = {
    _id: ObjectId;
    company: ObjectId;
    title: string;
    mainImage?: ObjectId;
    budgetMax?: number;
    currency?: {abbreviation?: string};
    address?: {city?: {name?: string}};
    category?: {name?: string; names?: ListNames};
};

/** A task's price is its "up to" budget (D146). */
const TASK_SORT_SPECS: Record<string, Record<string, 1 | -1>> = {
    newest: {createdAt: -1},
    priceAsc: {budgetMax: 1, createdAt: -1},
    priceDesc: {budgetMax: -1, createdAt: -1},
};

/**
 * The task board belongs to the platform company, which keeps the portal's jobs (D172, D197): on the apex; no other
 * company's site has one.
 */
async function taskBoardCompanyIds(scope: PortalScope): Promise<ObjectId[]> {
    const platformId = await findPlatformCompanyId();
    if (!platformId || (scope.companyId && !platformId.equals(scope.companyId))) return [];
    return [platformId];
}

/** The cities of the open public tasks, for the cards and the "where" filter. */
async function taskCities(companyIds: ObjectId[]): Promise<Map<string, string[]>> {
    const [platformId] = companyIds;
    if (!platformId) return new Map();
    const tasks = await taskRequestService.find(
        {...publicTaskClause(platformId), ...openTaskClause()},
        {withDeleted: false},
        {path: "address.city", select: "name"},
        "address.city",
    );
    const names = new Set(tasks.flatMap((task) => task.address?.city?.name ? [task.address.city.name] : []));
    return new Map([[platformId.toString(), [...names]]]);
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
    const [platformId] = companyIds;
    if (!platformId) return {items: [], total: 0};
    const filter = await openPublicTaskFilter(platformId, {
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
            populate: [{path: "category", select: "name names"}, {path: "currency", select: PORTAL_CURRENCY_SELECT}, {path: "address.city", select: "name"}],
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
        subtitle: task.category ? listDisplayName(task.category) : undefined,
        image: publicMediaUrl(task.mainImage),
        ...(task.budgetMax != null && task.currency?.abbreviation ? {price: {amount: task.budgetMax, currency: task.currency.abbreviation, upTo: true}} : {}),
        city: task.address?.city?.name,
        section: "tasks",
        path: `/task?${new URLSearchParams({id: task._id.toString()})}`,
    }));
    return {items, total};
}

/** The tasks section of the portal (D172): the public task board, on the apex (D197). */
export function registerTasksPortalProvider(): void {
    registerPortalProvider({
        key: "tasks",
        order: 16,
        sitePath: "tasks",
        // As the portal names it: the section (sinfonia `portalSectionName`) and its kinds' tabs (`portalKindName`).
        names: {
            "en-US": {title: "Tasks", description: "Jobs clients posted. Pros send quotes; the client picks one.", kinds: {task: "Tasks"}},
            "sq-AL": {title: "Kërkesat për ofertë", description: "Punë të publikuara nga klientët. Profesionistët ofertojnë, klienti zgjedh njërin.", kinds: {task: "Kërkesat për ofertë"}},
            "it-IT": {title: "Richieste di preventivo", description: "Lavori pubblicati dai clienti. I professionisti fanno un'offerta, il cliente sceglie.", kinds: {task: "Richieste di preventivo"}},
            "fr-FR": {title: "Demandes de devis", description: "Des travaux publiés par des clients. Les pros font une offre, le client choisit.", kinds: {task: "Demandes de devis"}},
            "de-CH": {title: "Ausschreibungen", description: "Aufträge von Kundinnen und Kunden. Fachleute offerieren, die Kundschaft wählt.", kinds: {task: "Ausschreibungen"}},
        },
        kinds: ["task"],
        companyIds: taskBoardCompanyIds,
        citiesByCompany: taskCities,
        browse: (params) => browseTasks(params),
        // Tasks posted after the date (D178): a saved search's alert, a person's kept items.
        newSince: (context: PortalNewSinceContext) => browseTasks({...context, sort: "newest", skip: 0}, newSinceClause(context)),
        // A posted task's page (D181): `/task?id=…`; a client asking for quotes, so a Demand.
        itemAt: async ({scope, companyId, path, languageCode}) => {
            const {segments, query} = itemPagePath(path);
            const clause = segments[0] === "task" ? idClause(query.get("id")) : null;
            if (!clause) return undefined;
            const {items} = await browseTasks({kind: "task", scope, companyIds: [companyId], filters: {}, skip: 0, limit: 1, languageCode}, clause);
            return items[0] ? {item: items[0], schemaType: "Demand"} : undefined;
        },
    });
}
