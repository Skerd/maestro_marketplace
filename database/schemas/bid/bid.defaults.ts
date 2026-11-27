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

const LEAD_REFERENCE = {reason: "a lead in the provider's company points at the job and quote in the platform company", fields: ["TaskLead.taskRequest", "TaskLead.bid"]} as const;

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
        seedKey: "bid-01-house-build",
        taskRequestSeedKey: "task-01-house-build",
        amount: 108000,
        deliveryDays: 150,
        status: "pending",
        proposal: "Shell and roof for 108,000 EUR, built to your permit drawings. Our site engineer can meet your architect on the plot this week."
    },
    {
        seedKey: "bid-02-bathroom-refit",
        taskRequestSeedKey: "task-02-bathroom-refit",
        amount: 3600,
        deliveryDays: 14,
        status: "accepted",
        proposal: "Walk-in shower with linear drain, wall-hung toilet frame and full waterproofing. Two weeks, tiles at your choice."
    },
    {
        seedKey: "bid-03-office-fitout",
        taskRequestSeedKey: "task-03-office-fitout",
        amount: 27500,
        deliveryDays: 40,
        status: "pending",
        proposal: "Glass partitions, mineral-fibre ceiling, vinyl flooring and paint in 40 working days, with a weekly progress walk."
    },
    {
        seedKey: "bid-04-terrace-leak",
        taskRequestSeedKey: "task-04-terrace-leak",
        amount: 1350,
        deliveryDays: 6,
        status: "pending",
        proposal: "Flood test first to find the leak, then a new drain outlet and a transparent membrane over the sound tiles."
    },
    {
        seedKey: "bid-05-shop-strip-out",
        taskRequestSeedKey: "task-05-shop-strip-out",
        amount: 1700,
        deliveryDays: 4,
        status: "rejected",
        proposal: "Strip-out in four days with two skips, dust screens to the street and the floor left swept."
    },
    {
        seedKey: "bid-06-retaining-wall",
        taskRequestSeedKey: "task-06-retaining-wall",
        amount: 3300,
        deliveryDays: 15,
        status: "pending",
        proposal: "Reinforced concrete wall on a strip footing, drainage pipe and gravel behind it, faced in local stone."
    },
    {
        seedKey: "bid-07-attic-conversion",
        taskRequestSeedKey: "task-07-attic-conversion",
        amount: 8700,
        deliveryDays: 25,
        status: "accepted",
        proposal: "Insulation between and under the rafters, timber floor, two roof windows and a space-saving staircase."
    },
    {
        seedKey: "bid-08-facade-repair",
        taskRequestSeedKey: "task-08-facade-repair",
        amount: 11200,
        deliveryDays: 30,
        status: "pending",
        proposal: "Render repairs, mesh over the cracks and two coats of silicone paint, with scaffolding and street protection."
    },
    {
        seedKey: "bid-09-kitchen-tiles",
        taskRequestSeedKey: "task-09-kitchen-tiles",
        amount: 780,
        deliveryDays: 4,
        status: "pending",
        proposal: "Old tiles off, floor levelled and your tiles laid with matching grout. Rubble removal included."
    },
    {
        seedKey: "bid-10-steel-stairs",
        taskRequestSeedKey: "task-10-steel-stairs",
        amount: 2300,
        deliveryDays: 12,
        status: "rejected",
        proposal: "Galvanised steel straight staircase with landing and handrail, powder-coated anthracite, fixed with chemical anchors."
    }
];

export type CreateBidsResult = {
    bids: HydratedDocument<IBid>[];
    bySeedKey: Record<string, HydratedDocument<IBid>>;
};

/**
 * Seeds one demo quote per task request from the provider's company, the way a real one is stored (D143, D172): the
 * quote next to the job in the platform company, and the provider's lead in its own company (matched when it has
 * an active listing in the job's category, else from the board), which can open the job's photos.
 *
 * `Bid.name` is immutable and auto-generated, and the schema carries no tag field,
 * so idempotency keys on `{company, taskRequest, bidderCompany}` — the seeds place at most
 * one quote per task from the provider's company, as the board allows (D172).
 */
export async function createBids(
    parentLogger: serverLogger,
    platform: ICompany,
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
                company: platform._id,
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
                company: platform._id,
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
