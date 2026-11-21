import {ObjectId} from "mongodb";
import dayjs from "dayjs";
import type {HydratedDocument} from "mongoose";
import {toMinor} from "armonia/src/modules/core/helpers/money";
import type {TaskLeadStatus} from "armonia/src/modules/marketplace/api/marketplace/private/taskLead/taskLead.schema-def";
import {getLogger, type serverLogger} from "@coreModule/loggers/serverLog";
import {allowForeignReferences} from "@coreModule/utilities/endpoints/tenantScope";
import {demoName} from "@coreModule/utilities/helpers";
import {decimal128FromMinor} from "@coreModule/utilities/helpers/money";
import {demoSeedName, withDemoSeedMarker} from "@coreModule/database/demo/demoSeed";
import {resolveDemoImagesFromUnsplash} from "@coreModule/database/demo/demoMedia";
import {coreDemoCustomerSeeds} from "@coreModule/database/demo/demoSignupUsers";
import Company, {type ICompany} from "@coreModule/database/schemas/company/company";
import Currency from "@coreModule/database/schemas/currency/currency";
import Country from "@coreModule/database/schemas/country/country";
import City from "@coreModule/database/schemas/city/city";
import User from "@coreModule/database/schemas/user/user";
import Media from "@coreModule/database/schemas/media/media";
import EscrowTransaction from "@financeModule/database/schemas/escrowTransaction/escrowTransaction";
import TaskRequest, {type ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import TaskLead from "@marketplaceModule/database/schemas/taskLead/taskLead";
import Bid from "@marketplaceModule/database/schemas/bid/bid";
import Order from "@marketplaceModule/database/schemas/order/order";
import OrderMilestone from "@marketplaceModule/database/schemas/orderMilestone/orderMilestone";
import Review from "@marketplaceModule/database/schemas/review/review";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import ListingCategory from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import {resolveListingPhotoIds, resolveTaskRequestPhotoIds} from "@marketplaceModule/database/demo/marketplace.demo.media";
import {findMarketplaceOperatorId, marketplaceCategoryClause} from "@marketplaceModule/utilities/services/marketplaceOperator";
import {jobApproxPoint} from "@marketplaceModule/utilities/services/jobLocation";
import {endJobLeads, openAwardOrder} from "@marketplaceModule/utilities/services/jobOutcome";

/** Tirana Pros in the core company seed: online design, writing and tech work. */
const TIRANA_PROS_DEMO_VAT = "Z523456789Z";
const LEAD_REFERENCE = {reason: "a lead in the provider's company points at the job in the marketplace operator", fields: ["TaskLead.taskRequest", "TaskLead.bid"]} as const;

type Provider = "fix" | "pros";
type DemoLead = {
    company: Provider;
    origin: "matched" | "board";
    status: Extract<TaskLeadStatus, "new" | "viewed" | "quoted">;
    quote?: {amount: number; deliveryDays: number; proposal: string};
};
type DemoAward = {
    company: Provider;
    order: "in_progress" | "completed";
    milestones?: {name: string; amount: number; status: "pending" | "released"}[];
    review?: {rating: number; comment: string};
};
type DemoTask = {
    seedKey: string;
    title: string;
    description: string;
    /** Index into the core demo customers (the portal buyers). */
    buyer: number;
    categorySlug: string;
    /** A pin in Durrës for on-site work; online work has none. */
    place?: {street: string; latitude: number; longitude: number};
    budgetMax?: number;
    expiresInDays: number;
    /** Posted on Adria Home Fix's own site: only its pros see it, never the board (D143). */
    onFixSite?: boolean;
    outcome: "open" | "closed" | "expired" | "awarded";
    leads: DemoLead[];
    award?: DemoAward;
};

/** Every state a task of the board can be in (D172), on the demo customers' tasks. */
const BOARD_TASKS: readonly DemoTask[] = [
    {
        seedKey: "board-01-tap", title: "Fix a dripping kitchen tap", buyer: 0, categorySlug: "home-plumbing-leaks",
        description: "The kitchen mixer tap drips all night, even when closed hard. Probably the cartridge. Evenings after 17:00 suit me best.",
        place: {street: "Rruga Taulantia 14", latitude: 41.3155, longitude: 19.4469}, budgetMax: 60, expiresInDays: 20, outcome: "open",
        leads: [{company: "fix", origin: "matched", status: "quoted", quote: {amount: 45, deliveryDays: 1, proposal: "New ceramic cartridge and seals, tested on the spot. Parts included."}}],
    },
    {
        seedKey: "board-02-logo", title: "Logo for a new bakery in Tirana", buyer: 1, categorySlug: "design-logo-branding",
        description: "We open a small sourdough bakery in Blloku in March. We need a logo that works on the shop sign, bags and Instagram.",
        budgetMax: 200, expiresInDays: 25, outcome: "open",
        leads: [
            {company: "pros", origin: "matched", status: "quoted", quote: {amount: 180, deliveryDays: 7, proposal: "Three concepts in a week, two rounds of changes, files for print and social."}},
            // Adria Home Fix does no design work, yet any services company may quote from the board (D172).
            {company: "fix", origin: "board", status: "quoted", quote: {amount: 150, deliveryDays: 10, proposal: "Our in-house designer did our own branding; two concepts and the sign artwork."}},
        ],
    },
    {
        seedKey: "board-03-shelves", title: "Hang shelves and assemble a wardrobe", buyer: 2, categorySlug: "home-handyman",
        description: "Two IKEA wall shelves into concrete and a PAX wardrobe (two doors) to assemble. All parts are here.",
        place: {street: "Rruga Egnatia 32", latitude: 41.3246, longitude: 19.4565}, expiresInDays: 18, outcome: "open",
        leads: [{company: "fix", origin: "matched", status: "viewed"}],
    },
    {
        seedKey: "board-04-lights", title: "Install three ceiling lights", buyer: 0, categorySlug: "home-electrical",
        description: "Replace three old ceiling lamps with LED fittings I bought. The wiring is there; one switch needs checking.",
        place: {street: "Bulevardi Epidamn 5", latitude: 41.3189, longitude: 19.4497}, budgetMax: 150, expiresInDays: 15, outcome: "awarded",
        leads: [
            {company: "fix", origin: "matched", status: "quoted", quote: {amount: 120, deliveryDays: 2, proposal: "Two visits: fittings first, then the switch circuit checked and certified."}},
            {company: "pros", origin: "board", status: "quoted", quote: {amount: 140, deliveryDays: 3, proposal: "Our partner electrician can do it this week."}},
        ],
        award: {
            company: "fix", order: "in_progress",
            milestones: [
                {name: "Kitchen and hall fittings", amount: 70, status: "released"},
                {name: "Bedroom fitting and switch check", amount: 50, status: "pending"},
            ],
        },
    },
    {
        seedKey: "board-05-translation", title: "Translate our website into Italian", buyer: 1, categorySlug: "writing-translation-service",
        description: "Twelve pages of a small guesthouse website, about 4,000 words, from English into Italian. Tone: warm, simple.",
        budgetMax: 300, expiresInDays: 12, outcome: "awarded",
        leads: [{company: "pros", origin: "board", status: "quoted", quote: {amount: 260, deliveryDays: 5, proposal: "Native Italian translator, proofread by a second linguist, delivered in your CMS format."}}],
        award: {company: "pros", order: "completed", review: {rating: 5, comment: "Natural Italian, delivered a day early. Our Italian guests noticed."}},
    },
    {
        seedKey: "board-06-drain", title: "Unblock a slow bathroom drain", buyer: 2, categorySlug: "home-plumbing-drains",
        description: "The shower drains very slowly. I tried a plunger. Ground floor flat.",
        place: {street: "Rruga Skënderbeu 8", latitude: 41.3122, longitude: 19.4421}, budgetMax: 80, expiresInDays: 14, outcome: "closed",
        leads: [{company: "fix", origin: "matched", status: "quoted", quote: {amount: 70, deliveryDays: 1, proposal: "Machine clearing and a camera check of the pipe."}}],
    },
    {
        seedKey: "board-07-cleaning", title: "Deep clean a two-room flat after moving out", buyer: 0, categorySlug: "home-cleaning",
        description: "Kitchen, bathroom, windows and floors, so I get my deposit back. Flat is empty.",
        place: {street: "Rruga Aleksandër Goga 21", latitude: 41.3201, longitude: 19.4512}, budgetMax: 120, expiresInDays: -3, outcome: "expired",
        leads: [{company: "fix", origin: "matched", status: "new"}],
    },
    {
        seedKey: "board-08-boiler", title: "Service a gas boiler before winter", buyer: 2, categorySlug: "home-plumbing-boilers",
        description: "Yearly service of a wall-hung gas boiler, about 6 years old. Pressure drops now and then.",
        place: {street: "Rruga Dyrrah 17", latitude: 41.3178, longitude: 19.4459}, budgetMax: 90, expiresInDays: 21, outcome: "open", onFixSite: true,
        leads: [{company: "fix", origin: "matched", status: "new"}],
    },
];

/** Board task photos: the task kits for online work, the home-services listing kits for on-site work (Unsplash ids). */
const BOARD_PHOTO_KEYS: Readonly<Record<string, string>> = {
    "board-01-tap": "home-01-leaks", "board-02-logo": "task-09-brand-identity", "board-03-shelves": "home-06-handyman",
    "board-04-lights": "home-04-electrical", "board-05-translation": "task-07-business-plan", "board-06-drain": "home-02-drains",
    "board-07-cleaning": "home-05-cleaning", "board-08-boiler": "home-03-boilers",
};

/** A board task's photo kit: a task kit, else the listing kit of the same work (the home services). */
function boardPhotoIds(seedKey: string): string[] {
    const key = BOARD_PHOTO_KEYS[seedKey] ?? "";
    const taskKit = resolveTaskRequestPhotoIds(key);
    return taskKit.length ? taskKit : resolveListingPhotoIds(key);
}

/** Great-circle km, for a matched lead's distance from the listing's pin (the matching's `$geoNear` does the same). */
function kmBetween(a: {latitude: number; longitude: number}, b: {latitude: number; longitude: number}): number {
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2
        + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
    return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/**
 * The public task board's demo (D172, P21.2a): the core demo customers' tasks in the marketplace operator, each in one
 * state of the workflow, with matched and board leads and quotes in Adria Home Fix and Tirana Pros, two awards with
 * their orders (one in progress with a milestone paid from escrow, one completed and reviewed), a closed, an expired and
 * a private site task. Written directly with the fields the real flows write (the award through `openAwardOrder` and
 * `endJobLeads`), so seeding sends no email or notice. Runs from the home-services company's seed, the last services
 * company in the seed list; a task that already exists is left as it is.
 */
export async function seedTaskBoardDemo(parentLogger: serverLogger | undefined, fixCompany: ICompany): Promise<void> {
    const logger = getLogger("marketplace_task_board_demo", parentLogger);
    logger.start("Seeding the task board demo...");
    const ctx = {logger, languageCode: "en-US"};

    const operatorId = await findMarketplaceOperatorId();
    const [operator, pros, euro, albania, buyers] = await Promise.all([
        operatorId ? Company.findById(operatorId) : null,
        Company.findOne({vat: TIRANA_PROS_DEMO_VAT}),
        Currency.findOne({abbreviation: "EUR"}),
        Country.findOne({code: "AL"}).select("_id"),
        User.find({username: {$in: coreDemoCustomerSeeds.map((seed) => seed.username)}}),
    ]);
    const durres = albania ? await City.findOne({country: albania._id, name: "Durrës"}).select("_id") : null;
    if (!operator || !euro || !albania || !durres || !buyers.length) {
        logger.warn("Task board demo skipped: no operator, EUR, Albania/Durrës or demo customers yet.");
        logger.finish("Task board demo skipped.");
        return;
    }
    const companies: Record<Provider, ICompany | null> = {fix: fixCompany, pros};
    const buyerOf = (index: number) => buyers.find((user) => user.username === coreDemoCustomerSeeds[index]?.username) ?? buyers[0];
    const categoryClause = await marketplaceCategoryClause();

    for (const seed of BOARD_TASKS) {
        const name = demoSeedName(seed.seedKey);
        if (await TaskRequest.exists({company: operator._id, name})) {
            logger.debug(`Board task '${seed.seedKey}' already seeded`);
            continue;
        }
        if (seed.leads.some((lead) => !companies[lead.company]) || (seed.award && !companies[seed.award.company])) {
            logger.warn(`Board task '${seed.seedKey}' skipped: a provider company is missing`);
            continue;
        }
        const category = await ListingCategory.findOne({slug: seed.categorySlug, ...categoryClause}).select("_id");
        if (!category) {
            logger.warn(`Board task '${seed.seedKey}' skipped: category '${seed.categorySlug}' not found`);
            continue;
        }
        const buyer = buyerOf(seed.buyer);
        const address = seed.place
            ? {street: seed.place.street, postalCode: "2001", country: albania._id, city: durres._id, latitude: seed.place.latitude, longitude: seed.place.longitude}
            : undefined;
        const approxPoint = jobApproxPoint(address);
        const photos = await resolveDemoImagesFromUnsplash(boardPhotoIds(seed.seedKey), seed.seedKey, seed.title, operator, buyer._id, logger, "taskRequest");
        if (!photos.mainImageId) {
            logger.warn(`Board task '${seed.seedKey}' skipped: its photo could not be resolved`);
            continue;
        }

        const task = await TaskRequest.create({
            name,
            title: demoName(seed.title),
            description: seed.description,
            category: category._id,
            requester: buyer._id,
            ...(seed.budgetMax != null ? {budgetMax: seed.budgetMax} : {}),
            currency: euro._id,
            status: "open",
            ...(address ? {address} : {}),
            ...(approxPoint ? {approxPoint} : {}),
            expiresAt: dayjs().add(seed.expiresInDays, "day").toDate(),
            mainImage: photos.mainImageId,
            imageGallery: photos.galleryIds,
            ...(seed.onFixSite ? {restrictedToCompany: fixCompany._id} : {}),
            company: operator._id,
            createdBy: buyer._id,
        });

        // Leads and quotes, in each provider's company; the quote sits next to the task in the operator.
        const bidByCompany = new Map<Provider, ObjectId>();
        for (const demo of seed.leads) {
            const company = companies[demo.company];
            if (!company) continue;
            const listing = demo.origin === "matched"
                ? await Listing.findOne({company: company._id, category: category._id, status: "active"}).select("_id provider serviceArea")
                : null;
            const anyListing = listing ?? await Listing.findOne({company: company._id}).select("provider");
            const provider = anyListing?.provider ?? company.createdBy;
            if (!provider) continue;
            const area = listing?.serviceArea;
            const bid = demo.quote ? await Bid.create({
                taskRequest: task._id, bidder: provider, bidderCompany: company._id, amount: demo.quote.amount, currency: euro._id,
                proposal: demo.quote.proposal, deliveryDays: demo.quote.deliveryDays, status: "pending", company: operator._id, createdBy: provider,
            }) : null;
            if (bid) bidByCompany.set(demo.company, bid._id);
            await allowForeignReferences(LEAD_REFERENCE, () => TaskLead.create({
                taskRequest: task._id, provider, origin: demo.origin, status: demo.status, company: company._id, createdBy: provider,
                ...(listing ? {listing: listing._id} : {}),
                ...(area && seed.place ? {distanceKm: kmBetween(area, seed.place)} : {}),
                ...(bid ? {bid: bid._id} : {}),
            }));
        }
        // The providers' staff open the task's photos through the private media route, as with a real lead.
        const shareWith = [...new Set(seed.leads.map((lead) => companies[lead.company]?._id?.toString()).filter((id): id is string => !!id))];
        const media = [photos.mainImageId, ...photos.galleryIds].filter((id): id is ObjectId => !!id);
        if (media.length && shareWith.length) {
            await Media.updateMany({_id: {$in: media}}, {$addToSet: {sharedWithCompanies: {$each: shareWith.map((id) => new ObjectId(id))}}});
        }

        if (seed.outcome === "closed" || seed.outcome === "expired") {
            await TaskRequest.updateOne({_id: task._id}, {$set: {status: "closed"}});
            await endJobLeads(task._id, "expired", ctx);
        }
        if (seed.outcome === "awarded" && seed.award) await seedAward(task, seed, seed.award, bidByCompany, companies, euro._id, ctx);
        logger.debug(`Seeded board task '${seed.seedKey}' (${seed.outcome})`);
    }
    logger.finish("Finished seeding the task board demo!");
}

/** The buyer accepted one quote: the order opens in the winner's company and goes on from there (D147). */
async function seedAward(
    task: HydratedDocument<ITaskRequest>,
    seed: DemoTask,
    award: DemoAward,
    bidByCompany: Map<Provider, ObjectId>,
    companies: Record<Provider, ICompany | null>,
    currency: ObjectId,
    ctx: {logger: serverLogger; languageCode: string},
): Promise<void> {
    const winningBid = bidByCompany.get(award.company);
    const company = companies[award.company];
    const winner = winningBid ? await Bid.findById(winningBid) : null;
    if (!winner || !company) return;

    await Bid.updateOne({_id: winner._id}, {$set: {status: "accepted"}});
    await Bid.updateMany({taskRequest: task._id, _id: {$ne: winner._id}, status: "pending"}, {$set: {status: "rejected"}});
    await TaskRequest.updateOne({_id: task._id}, {$set: {status: "awarded"}});
    await endJobLeads(task._id, {winningBid: winner._id}, ctx);
    const order = await openAwardOrder(task, winner, ctx);

    const completed = award.order === "completed";
    await Order.updateOne({_id: order._id}, {$set: {status: award.order}});

    const escrow = (type: "hold" | "release", amount: number, extra: Record<string, unknown> = {}) => EscrowTransaction.create({
        sourceType: "marketplaceOrder", sourceId: order._id, order: order._id, amount: decimal128FromMinor(toMinor(amount)), currency,
        type, status: "completed", gatewayStatus: "ledger_only", company: company._id, createdBy: company.createdBy, ...extra,
    });
    // The buyer paid into escrow on accepting; the provider is paid per finished milestone, or all at completion.
    await escrow("hold", winner.amount);
    for (const [orderIndex, milestone] of (award.milestones ?? []).entries()) {
        const created = await OrderMilestone.create({
            order: order._id, name: demoName(milestone.name), amount: milestone.amount, currency, status: milestone.status, orderIndex,
            company: company._id, createdBy: task.requester,
        });
        if (milestone.status === "released") await escrow("release", milestone.amount, {orderMilestone: created._id, recipient: "provider"});
    }
    if (completed) await escrow("release", winner.amount, {recipient: "provider"});
    if (award.review) {
        await Review.create({
            order: order._id, rating: award.review.rating, comment: withDemoSeedMarker(award.review.comment, seed.seedKey),
            reviewer: task.requester, company: company._id, createdBy: task.requester,
        });
    }
}
