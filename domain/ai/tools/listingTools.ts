/**
 * `search_listings` + `search_providers` — AI-assistant tools for the supply
 * side of the service marketplace: what is on offer, and who offers it.
 *
 * Answers "what services do we list under 200?", "which listings are still
 * drafts?", "who are our top-rated providers?", "which providers can't be paid
 * out yet?".
 *
 * SECURITY: arguments are untrusted LLM output — re-validated with Zod, free
 * text regex-escaped, and every query hard-scoped to `ctx.companyId`. Each tool
 * needs the panel's read permission, and a non-admin sees only their own profile. Provider
 * payout details are reported as booleans only: whether Stripe onboarding is
 * complete, never the account identifier itself.
 *
 * @module listingTools
 */

import {z} from "zod";
import {registerAssistantTool} from "@coreModule/domain/ai/tools/toolRegistry";
import type {AssistantTool, AssistantToolContext} from "@coreModule/domain/ai/tools/assistantTool.types";
import {accessDenied, requirePermission} from "@coreModule/domain/ai/tools/assistantToolAccess";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {listingCategoryService} from "@marketplaceModule/database/schemas/listingCategory/listingCategory.service";
import {marketplaceCategoryClause} from "@marketplaceModule/utilities/services/marketplaceOperator";
import {providerProfileService} from "@marketplaceModule/database/schemas/providerProfile/providerProfile.service";
import type {ListingStatus, PricingType} from "@marketplaceModule/database/schemas/listing/listing";
import {
    DEFAULT_RESULTS,
    companyScope,
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

const LISTING_STATUS_VALUES = enumValues<ListingStatus>({draft: true, active: true, inactive: true});
const PRICING_TYPE_VALUES = enumValues<PricingType>({fixed: true, hourly: true});

/** Sort orders the model may request, mapped to real Mongo sorts. */
const LISTING_SORTS: Record<string, Record<string, 1 | -1>> = {
    price_asc: {price: 1},
    price_desc: {price: -1},
    best_rated: {avgRating: -1},
    most_reviewed: {reviewCount: -1},
    newest: {createdAt: -1},
    title: {title: 1}
};
const LISTING_SORT_VALUES = Object.keys(LISTING_SORTS);

// ── search_listings ──────────────────────────────────────────────────────────

const SearchListingsArgs = z
    .object({
        search: z.string().trim().min(1).optional(),
        categoryName: z.string().trim().min(1).optional(),
        status: z.enum(LISTING_STATUS_VALUES as [string, ...string[]]).optional(),
        pricingType: z.enum(PRICING_TYPE_VALUES as [string, ...string[]]).optional(),
        minPrice: z.coerce.number().nonnegative().optional(),
        maxPrice: z.coerce.number().nonnegative().optional(),
        minRating: z.coerce.number().min(0).max(5).optional(),
        maxDeliveryDays: z.coerce.number().int().positive().optional(),
        tag: z.string().trim().min(1).optional(),
        sortBy: z.enum(LISTING_SORT_VALUES as [string, ...string[]]).optional(),
        limit: limitArg
    })
    .strip();

const listingParameters = {
    type: "object" as const,
    properties: {
        search: {type: "string", description: "Free text matched against the listing title or description."},
        categoryName: {type: "string", description: "Only listings in the category whose name matches this."},
        status: {
            type: "string",
            enum: LISTING_STATUS_VALUES,
            description: "Listing status: draft, active (visible to buyers), or inactive."
        },
        pricingType: {
            type: "string",
            enum: PRICING_TYPE_VALUES,
            description: "How the service is priced: fixed (per job) or hourly."
        },
        minPrice: {type: "number", description: "Minimum price in the listing's own currency."},
        maxPrice: {type: "number", description: "Maximum price in the listing's own currency."},
        minRating: {type: "number", description: "Minimum average review rating, 0 to 5."},
        maxDeliveryDays: {type: "integer", description: "Only listings promising delivery within this many days."},
        tag: {type: "string", description: "Only listings carrying this tag."},
        sortBy: {
            type: "string",
            enum: LISTING_SORT_VALUES,
            description: "Result order (default title). Use best_rated for \"top services\", price_asc for \"cheapest\"."
        },
        limit: limitParameter
    },
    required: [] as string[]
};

async function executeListings(rawArgs: unknown, ctx: AssistantToolContext): Promise<unknown> {
    // The assistant shows only what the panel would: the same read permission
    const access = await requirePermission(ctx, "listings[read:title]");
    if (!access.allowed) return accessDenied("marketplace listings");

    const args = SearchListingsArgs.parse(rawArgs ?? {});

    // Hard company scope — the only scope the tool is allowed to read.
    const query: Record<string, unknown> = companyScope(ctx);

    if (args.categoryName != null) {
        const categories = await listingCategoryService.find(
            // The shared tree (D144): every company files under the operator's categories.
            {...(await marketplaceCategoryClause()), name: regexClause(args.categoryName)},
            findOptions(ctx),
            undefined,
            "_id",
            undefined,
            25
        );
        const categoryIds = categories.map((c: any) => c._id).filter(Boolean);
        if (categoryIds.length === 0) {
            return emptyResult(`No listing category matching "${args.categoryName}".`);
        }
        query.category = {$in: categoryIds};
    }

    if (args.search != null) {
        const rx = regexClause(args.search);
        query.$or = [{title: rx}, {description: rx}, {name: rx}];
    }
    if (args.status) query.status = args.status;
    if (args.pricingType) query.pricingType = args.pricingType;
    if (args.tag != null) query.tags = regexClause(args.tag);
    if (args.minRating != null) query.avgRating = {$gte: args.minRating};
    if (args.maxDeliveryDays != null) query.deliveryDays = {$lte: args.maxDeliveryDays};

    const price = numberRange(args.minPrice, args.maxPrice);
    if (price) query.price = price;

    const limit = args.limit ?? DEFAULT_RESULTS;
    const sort = LISTING_SORTS[args.sortBy ?? "title"];

    const listings = await listingService.find(
        query,
        findOptions(ctx),
        [
            {path: "category", select: "name slug"},
            {path: "provider", select: "name surname fullName username"},
            {path: "priceCurrency", select: "symbol abbreviation name"},
            {path: "address.city", select: "name"},
            {path: "address.country", select: "name"}
        ],
        "name title description category provider price priceCurrency pricingType deliveryDays " +
            "status tags avgRating reviewCount address",
        sort,
        limit
    );

    const results = listings.map((l: any) => ({
        id: l._id?.toString(),
        code: l.name ?? null,
        title: l.title ?? null,
        category: l.category?.name ?? null,
        provider: userDisplayName(l.provider),
        price: toNumber(l.price),
        currency: l.priceCurrency?.abbreviation || l.priceCurrency?.symbol || null,
        pricingType: l.pricingType ?? null,
        deliveryDays: l.deliveryDays ?? null,
        status: l.status ?? null,
        rating: l.avgRating ?? null,
        reviewCount: l.reviewCount ?? 0,
        tags: Array.isArray(l.tags) ? l.tags.slice(0, 10) : [],
        location: [l.address?.city?.name, l.address?.country?.name].filter(Boolean).join(", ") || null,
        description: shortText(l.description, 200)
    }));

    return listResult(listingService, query, results, ctx);
}

export const searchListingsTool: AssistantTool = {
    name: "search_listings",
    description:
        "Search the service marketplace's listings — the services providers offer " +
        "to buyers. Filter by free text, category, status (draft, active, " +
        "inactive), pricing type (fixed or hourly), price range, minimum rating, " +
        "maximum delivery days, or tag. Returns each listing's title, category, " +
        "provider, price, delivery time and rating, plus `total` — the true number " +
        "of matching listings. Use this for questions about what services are " +
        "offered. This is the SERVICE marketplace; for physical shop products use " +
        "search_products.",
    parameters: listingParameters,
    execute: executeListings
};

// ── search_providers ─────────────────────────────────────────────────────────

const SearchProvidersArgs = z
    .object({
        search: z.string().trim().min(1).optional(),
        skill: z.string().trim().min(1).optional(),
        payoutsEnabledOnly: z.coerce.boolean().optional(),
        onboardingIncompleteOnly: z.coerce.boolean().optional(),
        limit: limitArg
    })
    .strip();

const providerParameters = {
    type: "object" as const,
    properties: {
        search: {type: "string", description: "Free text matched against the provider's bio."},
        skill: {type: "string", description: "Only providers listing this skill."},
        payoutsEnabledOnly: {type: "boolean", description: "true = only providers who can currently receive payouts."},
        onboardingIncompleteOnly: {
            type: "boolean",
            description: "true = only providers who cannot be paid yet because payment onboarding is unfinished. Prefer this for \"who needs to finish setup\"."
        },
        limit: limitParameter
    },
    required: [] as string[]
};

async function executeProviders(rawArgs: unknown, ctx: AssistantToolContext): Promise<unknown> {
    // The assistant shows only what the panel would: the same read permission
    const access = await requirePermission(ctx, "providerprofiles[read:bio]");
    if (!access.allowed) return accessDenied("provider profiles");

    const args = SearchProvidersArgs.parse(rawArgs ?? {});

    // Hard company scope — the only scope the tool is allowed to read.
    const query: Record<string, unknown> = companyScope(ctx);

    if (args.search != null) query.bio = regexClause(args.search);
    if (args.skill != null) query.skills = regexClause(args.skill);

    if (args.payoutsEnabledOnly === true) {
        query.stripePayoutsEnabled = true;
    } else if (args.onboardingIncompleteOnly === true) {
        // Anything short of "payouts enabled" means money cannot reach them yet.
        query.stripePayoutsEnabled = {$ne: true};
    }

    const limit = args.limit ?? DEFAULT_RESULTS;

    // NOTE: stripeAccountId is deliberately NOT selected. Whether a provider can
    // be paid is useful; the account identifier is a credential-shaped value
    // with no place in a chat reply.
    const providers = await providerProfileService.find(
        query,
        findOptions(ctx),
        [{path: "user", select: "name surname fullName username"}],
        "user skills bio availability stripeChargesEnabled stripePayoutsEnabled " +
            "stripeDetailsSubmitted stripeAccountSyncedAt",
        {createdAt: -1},
        limit
    );

    const results = providers.map((p: any) => ({
        id: p._id?.toString(),
        provider: userDisplayName(p.user),
        skills: Array.isArray(p.skills) ? p.skills.slice(0, 12) : [],
        bio: shortText(p.bio, 200),
        availabilitySlots: Array.isArray(p.availability) ? p.availability.length : 0,
        payments: {
            canBePaidOut: p.stripePayoutsEnabled === true,
            canAcceptCharges: p.stripeChargesEnabled === true,
            onboardingSubmitted: p.stripeDetailsSubmitted === true,
            lastSyncedAt: p.stripeAccountSyncedAt ?? null
        }
    }));

    return listResult(
        providerProfileService,
        query,
        results,
        ctx,
        "Payment account identifiers are never returned — only whether payouts are possible."
    );
}

export const searchProvidersTool: AssistantTool = {
    name: "search_providers",
    description:
        "Search the marketplace's service providers. Filter by free text over " +
        "their bio, by skill, by `payoutsEnabledOnly`, or by " +
        "`onboardingIncompleteOnly` to find providers who cannot be paid yet " +
        "because they have not finished payment onboarding. Returns each " +
        "provider's skills, bio, availability slot count and payout readiness, " +
        "plus `total` — the true number of matching providers. Use this for " +
        "questions about who provides services, their skills, or payout setup " +
        "problems.",
    parameters: providerParameters,
    execute: executeProviders
};

/** Registered by the core tool bootstrap (registerAllAssistantTools). */
export function registerListingAssistantTools(): void {
    registerAssistantTool(searchListingsTool);
    registerAssistantTool(searchProvidersTool);
}
