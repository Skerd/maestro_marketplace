import dayjs from "dayjs";
import type {HydratedDocument} from "mongoose";
import Promotion, {type IPromotion, type PromotionLifecycleStatus, type PromotionType} from "./promotion";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {demoSeedName, demoSeedNameCandidates} from "@coreModule/database/demo/demoSeed";
import type {CreateListingsResult} from "@marketplaceModule/database/schemas/listing/listing.defaults";

export type PromotionSeed = {
    seedKey: string;
    listingSeedKey: string;
    type: PromotionType;
    lifecycleStatus: PromotionLifecycleStatus;
    stopReason?: string;
    /** Days from now when promotion starts (negative = already started). */
    startInDays: number;
    /** Duration in days after startAt. */
    durationDays: number;
};

export const defaultPromotionSeeds: readonly PromotionSeed[] = [
    {
        seedKey: "promo-01-logo-featured",
        listingSeedKey: "listing-01-logo-design",
        type: "featured",
        lifecycleStatus: "active",
        startInDays: -7,
        durationDays: 30,
    },
    {
        seedKey: "promo-02-website-sponsored",
        listingSeedKey: "listing-02-website-dev",
        type: "sponsored",
        lifecycleStatus: "active",
        startInDays: -3,
        durationDays: 21,
    },
    {
        seedKey: "promo-03-social-featured",
        listingSeedKey: "listing-04-social-media",
        type: "featured",
        lifecycleStatus: "active",
        startInDays: -1,
        durationDays: 14,
    },
    {
        seedKey: "promo-04-video-sponsored",
        listingSeedKey: "listing-05-video-editing",
        type: "sponsored",
        lifecycleStatus: "paused",
        startInDays: -10,
        durationDays: 20,
        stopReason: "Paused for budget review during demo seed.",
    },
    {
        seedKey: "promo-05-voice-featured",
        listingSeedKey: "listing-06-voice-over",
        type: "featured",
        lifecycleStatus: "active",
        startInDays: 0,
        durationDays: 15,
    },
    {
        seedKey: "promo-06-assistant-sponsored",
        listingSeedKey: "listing-07-virtual-assistant",
        type: "sponsored",
        lifecycleStatus: "active",
        startInDays: -5,
        durationDays: 45,
    },
    {
        seedKey: "promo-07-photo-featured",
        listingSeedKey: "listing-08-product-photo",
        type: "featured",
        lifecycleStatus: "stopped",
        startInDays: -30,
        durationDays: 14,
        stopReason: "Campaign ended — demo stopped promotion.",
    },
    {
        seedKey: "promo-08-mobile-sponsored",
        listingSeedKey: "listing-09-mobile-apps",
        type: "sponsored",
        lifecycleStatus: "active",
        startInDays: -2,
        durationDays: 28,
    },
    {
        seedKey: "promo-09-seo-featured",
        listingSeedKey: "listing-10-seo",
        type: "featured",
        lifecycleStatus: "active",
        startInDays: -4,
        durationDays: 18,
    },
    {
        seedKey: "promo-10-blog-sponsored",
        listingSeedKey: "listing-03-blog-writing",
        type: "sponsored",
        lifecycleStatus: "paused",
        startInDays: -8,
        durationDays: 10,
        stopReason: "Listing still in draft — promotion paused.",
    },
];

export type CreatePromotionsResult = {
    promotions: HydratedDocument<IPromotion>[];
    bySeedKey: Record<string, HydratedDocument<IPromotion>>;
};

export async function createPromotions(
    parentLogger: serverLogger,
    company: ICompany,
    listings: CreateListingsResult,
): Promise<CreatePromotionsResult> {
    const logger = getLogger("mongoDbInitialization-createPromotions", parentLogger);
    logger.start("Creating promotions...");

    const promotions: HydratedDocument<IPromotion>[] = [];
    const bySeedKey: Record<string, HydratedDocument<IPromotion>> = {};

    try {
        for (const seed of defaultPromotionSeeds) {
            const listing = listings.bySeedKey[seed.listingSeedKey];
            if (!listing) {
                logger.warn(`Skipping promotion "${seed.seedKey}": listing "${seed.listingSeedKey}" not found`);
                continue;
            }

            let existing = await Promotion.findOne({
                company: company._id,
                name: {$in: demoSeedNameCandidates(seed.seedKey)},
            });

            const startAt = dayjs().add(seed.startInDays, "day").startOf("day").toDate();
            const endAt = dayjs(startAt).add(seed.durationDays, "day").endOf("day").toDate();

            const payload = {
                name: demoSeedName(seed.seedKey),
                listing: listing._id,
                company: company._id,
                type: seed.type,
                lifecycleStatus: seed.lifecycleStatus,
                ...(seed.stopReason ? {stopReason: seed.stopReason} : {}),
                startAt,
                endAt,
                createdBy: listing.createdBy,
            };

            if (!existing) {
                existing = await Promotion.create(payload);
                logger.debug(`Successfully created promotion '${seed.seedKey}'`);
            } else {
                const nextName = demoSeedName(seed.seedKey);
                if (existing.name !== nextName) {
                    await Promotion.collection.updateOne({_id: existing._id}, {$set: {name: nextName}});
                    existing.name = nextName;
                }
                const {name: _name, ...updatable} = payload;
                existing.set(updatable);
                await existing.save();
                logger.debug(`Promotion '${seed.seedKey}' already exists; updated fields`);
            }

            promotions.push(existing);
            bySeedKey[seed.seedKey] = existing;
        }

        logger.finish("Finished creating promotions!", defaultPromotionSeeds.length);
        return {promotions, bySeedKey};
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        logger.err(`Error creating promotions: ${message}`);
        logger.fail("Failed to create promotions!");
        return {promotions: [], bySeedKey: {}};
    }
}
