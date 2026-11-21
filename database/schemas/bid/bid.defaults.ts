import type {HydratedDocument} from "mongoose";
import type {TaskLeadStatus} from "armonia/src/modules/marketplace/api/marketplace/private/taskLead/taskLead.schema-def";
import Bid, {type IBid, type BidStatus} from "./bid";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {IUser} from "@coreModule/database/schemas/user/user";
import {ICurrency} from "@coreModule/database/schemas/currency/currency";
import Media from "@coreModule/database/schemas/media/media";
import {demoSeedTag} from "@coreModule/database/demo/demoSeed";
import {allowForeignReferences} from "@coreModule/utilities/endpoints/tenantScope";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import TaskLead from "@marketplaceModule/database/schemas/taskLead/taskLead";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import type {CreateTaskRequestsResult} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.defaults";

const LEAD_REFERENCE = {reason: "a lead in the provider's company points at the job and quote in the marketplace operator", fields: ["TaskLead.taskRequest", "TaskLead.bid"]} as const;

/** The lead's state that goes with its quote's: waiting, won or lost (D143). */
const LEAD_STATUS_OF_BID: Readonly<Record<BidStatus, TaskLeadStatus>> = {pending: "quoted", accepted: "won", rejected: "lost"};

export type BidSeed = {
    seedKey: string;
    taskRequestSeedKey: string;
    amount: number;
    deliveryDays: number;
    /** Mirrors the task's own state: awarded task → accepted bid, closed task → rejected. */
    status: BidStatus;
    proposal: string;
};

export const defaultBidSeeds: readonly BidSeed[] = [
    {
        seedKey: "bid-01-mobile-app",
        taskRequestSeedKey: "task-01-mobile-app",
        amount: 3500,
        deliveryDays: 42,
        status: "pending",
        proposal: "I have 5 years of React Native experience and shipped two fitness apps. I can deliver in 6 weeks."
    },
    {
        seedKey: "bid-02-social-graphics",
        taskRequestSeedKey: "task-02-social-graphics",
        amount: 150,
        deliveryDays: 7,
        status: "accepted",
        proposal: "I can create 10 Instagram templates and 5 story frames in 1 week with two revision rounds."
    },
    {
        seedKey: "bid-03-ecommerce-setup",
        taskRequestSeedKey: "task-03-ecommerce-setup",
        amount: 1200,
        deliveryDays: 14,
        status: "pending",
        proposal: "Certified Shopify partner. I will configure payments, shipping zones, and a custom theme section library."
    },
    {
        seedKey: "bid-04-seo-audit",
        taskRequestSeedKey: "task-04-seo-audit",
        amount: 280,
        deliveryDays: 5,
        status: "pending",
        proposal: "Full crawl, Core Web Vitals review, and a prioritized spreadsheet of fixes with effort estimates."
    },
    {
        seedKey: "bid-05-product-video",
        taskRequestSeedKey: "task-05-product-video",
        amount: 950,
        deliveryDays: 21,
        status: "rejected",
        proposal: "Includes script consultation, one shoot day, and two edit revisions with licensed music."
    },
    {
        seedKey: "bid-06-podcast-editing",
        taskRequestSeedKey: "task-06-podcast-editing",
        amount: 320,
        deliveryDays: 2,
        status: "pending",
        proposal: "Monthly retainer for four episodes with 48-hour turnaround and audiogram clips for social."
    },
    {
        seedKey: "bid-07-business-plan",
        taskRequestSeedKey: "task-07-business-plan",
        amount: 650,
        deliveryDays: 10,
        status: "accepted",
        proposal: "Former VC analyst. Deliverable includes 3-year model, TAM/SAM/SOM, and pitch deck outline."
    },
    {
        seedKey: "bid-08-wordpress-migration",
        taskRequestSeedKey: "task-08-wordpress-migration",
        amount: 880,
        deliveryDays: 12,
        status: "pending",
        proposal: "Migrate posts, authors, categories, and media with 301 redirect map and staging QA."
    },
    {
        seedKey: "bid-09-brand-identity",
        taskRequestSeedKey: "task-09-brand-identity",
        amount: 520,
        deliveryDays: 9,
        status: "pending",
        proposal: "Three logo directions, palette, type pairings, and a 12-page mini brand book in PDF."
    },
    {
        seedKey: "bid-10-data-dashboard",
        taskRequestSeedKey: "task-10-data-dashboard",
        amount: 420,
        deliveryDays: 6,
        status: "rejected",
        proposal: "Looker Studio dashboard with Shopify + GA4 connectors, filters, and handoff documentation."
    }
];

export type CreateBidsResult = {
    bids: HydratedDocument<IBid>[];
    bySeedKey: Record<string, HydratedDocument<IBid>>;
};

/**
 * Seeds one demo quote per task request from the provider's company, the way a real one is stored (D143, D172): the
 * quote next to the job in the marketplace operator, and the provider's lead in its own company (matched when it has
 * an active listing in the job's category, else from the board), which can open the job's photos.
 *
 * `Bid.name` is immutable and auto-generated, and the schema carries no tag field,
 * so idempotency keys on `{company, taskRequest, bidderCompany}` — the seeds place at most
 * one quote per task from the provider's company, as the board allows (D172).
 */
export async function createBids(
    parentLogger: serverLogger,
    operator: ICompany,
    bidderCompany: ICompany,
    bidder: IUser,
    currency: ICurrency,
    taskRequests: CreateTaskRequestsResult,
): Promise<CreateBidsResult> {
    const logger = getLogger("mongoDbInitialization-createBids", parentLogger);
    logger.start("Creating bids...");

    const bids: HydratedDocument<IBid>[] = [];
    const bySeedKey: Record<string, HydratedDocument<IBid>> = {};

    for (const seed of defaultBidSeeds) {
        try {
            const taskRequest = taskRequests.bySeedKey[seed.taskRequestSeedKey];
            if (!taskRequest) {
                logger.warn(`Skipping bid "${seed.seedKey}": task "${seed.taskRequestSeedKey}" not found`);
                continue;
            }

            const seedTag = demoSeedTag(seed.seedKey);
            let existing = await Bid.findOne({
                company: operator._id,
                taskRequest: taskRequest._id,
                bidderCompany: bidderCompany._id,
            });

            const payload = {
                taskRequest: taskRequest._id,
                bidder: bidder._id,
                bidderCompany: bidderCompany._id,
                amount: seed.amount,
                currency: currency._id,
                proposal: seed.proposal,
                deliveryDays: seed.deliveryDays,
                status: seed.status,
                company: operator._id,
                createdBy: bidder._id,
            };

            if (!existing) {
                existing = await Bid.create(payload);
                logger.debug(`Successfully created bid (${seedTag})`);
            } else {
                existing.set(payload);
                await existing.save();
                logger.debug(`Bid (${seedTag}) already exists; updated fields`);
            }

            await seedLead(taskRequest, existing, bidderCompany, bidder);
            bids.push(existing);
            bySeedKey[seed.seedKey] = existing;
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            logger.err(`Error creating bid '${seed.seedKey}': ${message}`);
        }
    }

    if (bids.length === 0) {
        logger.fail("Failed to create bids!");
    } else {
        logger.finish("Finished creating bids!", bids.length);
    }

    return {bids, bySeedKey};
}

/** The provider's lead for a seeded quote, in its own company, with the job's photos shared with it (as a real lead). */
async function seedLead(
    taskRequest: CreateTaskRequestsResult["taskRequests"][number],
    bid: HydratedDocument<IBid>,
    bidderCompany: ICompany,
    bidder: IUser,
): Promise<void> {
    const listing = await Listing.findOne({company: bidderCompany._id, category: taskRequest.category, status: "active"}).select("_id");
    const lead = {
        taskRequest: taskRequest._id,
        provider: bidder._id,
        origin: listing ? "matched" : "board",
        status: LEAD_STATUS_OF_BID[bid.status],
        bid: bid._id,
        ...(listing ? {listing: listing._id} : {}),
        company: bidderCompany._id,
        createdBy: bidder._id,
    };
    await allowForeignReferences(LEAD_REFERENCE, async () => {
        const existing = await TaskLead.findOne({company: bidderCompany._id, taskRequest: taskRequest._id});
        if (existing) {
            existing.set(lead);
            await existing.save();
        } else {
            await TaskLead.create(lead);
        }
    });
    const media = [taskRequest.mainImage, ...(taskRequest.imageGallery ?? [])].map(nestedEntityToRef).filter((id) => id != null);
    if (media.length) {
        await Media.updateMany({_id: {$in: media}}, {$addToSet: {sharedWithCompanies: bidderCompany._id}});
    }
}
