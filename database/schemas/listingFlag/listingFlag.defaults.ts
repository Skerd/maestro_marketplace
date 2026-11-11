import type {HydratedDocument} from "mongoose";
import ListingFlag, {type IListingFlag, type ListingFlagReason} from "./listingFlag";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {IUser} from "@coreModule/database/schemas/user/user";
import type {CreateListingsResult} from "@marketplaceModule/database/schemas/listing/listing.defaults";

export type ListingFlagSeed = {
    seedKey: string;
    listingSeedKey: string;
    reason: ListingFlagReason;
    comment: string;
    status: "pending" | "reviewed" | "dismissed";
    resolution?: string;
};

/**
 * One flag per listing: `{listing, user}` is unique, and every flag is raised by the
 * same demo customer, so two flags on one listing would collide.
 *
 * The live rows were placeholder text ("123123", lorem ipsum) rather than anything a
 * moderator could act on, so these are authored instead — one per status, so the
 * moderation queue has a pending item, a resolved one and a dismissed one.
 */
export const defaultListingFlagSeeds: readonly ListingFlagSeed[] = [
    {
        seedKey: "flag-01-seo-misleading",
        listingSeedKey: "listing-10-seo",
        reason: "misleading",
        comment: "Promises a #1 Google ranking in 30 days, which no provider can guarantee.",
        status: "pending",
    },
    {
        seedKey: "flag-02-voice-spam",
        listingSeedKey: "listing-06-voice-over",
        reason: "spam",
        comment: "The same description is posted across several unrelated categories.",
        status: "reviewed",
        resolution: "Duplicate descriptions removed; the provider was warned.",
    },
    {
        seedKey: "flag-03-assistant-other",
        listingSeedKey: "listing-07-virtual-assistant",
        reason: "other",
        comment: "Reported for asking buyers to settle payment outside the platform.",
        status: "dismissed",
        resolution: "No off-platform payment request found in the order chat.",
    },
];

/**
 * Seeds the listing moderation queue.
 *
 * Idempotency runs on the natural `{company, listing, user}` key — the schema has no
 * `name` to carry a demo-seed marker, and that trio is already unique.
 */
export async function createListingFlags(
    parentLogger: serverLogger,
    company: ICompany,
    reporter: IUser,
    listings: CreateListingsResult,
): Promise<HydratedDocument<IListingFlag>[]> {
    const logger = getLogger("mongoDbInitialization-createListingFlags", parentLogger);
    logger.start("Creating listing flags...");

    const created: HydratedDocument<IListingFlag>[] = [];

    try {
        for (const seed of defaultListingFlagSeeds) {
            const listing = listings.bySeedKey[seed.listingSeedKey];
            if (!listing) {
                logger.warn(`Skipping flag "${seed.seedKey}": listing "${seed.listingSeedKey}" not found`);
                continue;
            }

            const payload = {
                listing: listing._id,
                user: reporter._id,
                reason: seed.reason,
                comment: seed.comment,
                status: seed.status,
                ...(seed.resolution ? {resolution: seed.resolution} : {}),
                company: company._id,
                createdBy: reporter._id,
            };

            let existing = await ListingFlag.findOne({
                company: company._id,
                listing: listing._id,
                user: reporter._id,
            });

            if (!existing) {
                existing = await ListingFlag.create(payload);
                logger.debug(`Successfully created listing flag '${seed.seedKey}'`);
            } else {
                existing.set(payload);
                await existing.save();
                logger.debug(`Listing flag '${seed.seedKey}' already exists; updated fields`);
            }

            created.push(existing);
        }

        logger.finish("Finished creating listing flags!", created.length);
        return created;
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        logger.err(`Error creating listing flags: ${message}`);
        logger.fail("Failed to create listing flags!");
        return [];
    }
}
