import type {HydratedDocument} from "mongoose";
import Bid, {type IBid, type BidStatus} from "./bid";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {IUser} from "@coreModule/database/schemas/user/user";
import {ICurrency} from "@coreModule/database/schemas/currency/currency";
import {demoSeedTag} from "@coreModule/database/demo/demoSeed";
import type {CreateTaskRequestsResult} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.defaults";

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
 * Seeds one demo bid per task request.
 *
 * `Bid.name` is immutable and auto-generated, and the schema carries no tag field,
 * so idempotency keys on `{company, taskRequest, bidder}` — the seeds place at most
 * one bid per task from the demo provider.
 */
export async function createBids(
    parentLogger: serverLogger,
    company: ICompany,
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
                company: company._id,
                taskRequest: taskRequest._id,
                bidder: bidder._id,
            });

            const payload = {
                taskRequest: taskRequest._id,
                bidder: bidder._id,
                amount: seed.amount,
                currency: currency._id,
                proposal: seed.proposal,
                deliveryDays: seed.deliveryDays,
                status: seed.status,
                company: company._id,
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
