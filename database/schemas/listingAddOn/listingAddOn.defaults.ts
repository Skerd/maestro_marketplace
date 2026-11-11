import type {HydratedDocument} from "mongoose";
import {ObjectId} from "mongodb";
import ListingAddOn, {type IListingAddOn} from "./listingAddOn";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {IUser} from "@coreModule/database/schemas/user/user";
import {ICurrency} from "@coreModule/database/schemas/currency/currency";
import {demoName} from "@coreModule/utilities/helpers";
import {demoSeedTag} from "@coreModule/database/demo/demoSeed";
import type {CreateListingsResult} from "@marketplaceModule/database/schemas/listing/listing.defaults";

export type ListingAddOnSeed = {
    seedKey: string;
    listingSeedKey: string;
    name: string;
    amount: number;
    deliveryDays?: number;
};

export const defaultListingAddOnSeeds: readonly ListingAddOnSeed[] = [
    {
        seedKey: "addon-01-extra-revision",
        listingSeedKey: "listing-01-logo-design",
        name: "Extra revision round",
        amount: 25,
        deliveryDays: 2,
    },
    {
        seedKey: "addon-02-source-files",
        listingSeedKey: "listing-01-logo-design",
        name: "Editable source files",
        amount: 15,
        deliveryDays: 1,
    },
    {
        seedKey: "addon-03-rush-delivery",
        listingSeedKey: "listing-02-website-dev",
        name: "48-hour rush delivery",
        amount: 120,
        deliveryDays: 2,
    },
    {
        seedKey: "addon-04-extra-article",
        listingSeedKey: "listing-03-blog-writing",
        name: "Additional 1000-word article",
        amount: 45,
        deliveryDays: 3,
    },
    {
        seedKey: "addon-05-extra-platform",
        listingSeedKey: "listing-04-social-media",
        name: "Extra social platform",
        amount: 50,
        deliveryDays: 2,
    },
    {
        seedKey: "addon-06-subtitles",
        listingSeedKey: "listing-05-video-editing",
        name: "Subtitles in 2 languages",
        amount: 35,
        deliveryDays: 1,
    },
    {
        seedKey: "addon-07-commercial-license",
        listingSeedKey: "listing-06-voice-over",
        name: "Commercial broadcast license",
        amount: 40,
        deliveryDays: 0,
    },
    {
        seedKey: "addon-08-extra-hours",
        listingSeedKey: "listing-07-virtual-assistant",
        name: "5 additional hours",
        amount: 110,
        deliveryDays: 1,
    },
    {
        seedKey: "addon-09-lifestyle-shots",
        listingSeedKey: "listing-08-product-photo",
        name: "Lifestyle product shots (5)",
        amount: 80,
        deliveryDays: 4,
    },
    {
        seedKey: "addon-10-app-store-screens",
        listingSeedKey: "listing-09-mobile-apps",
        name: "App Store screenshot set",
        amount: 95,
        deliveryDays: 3,
    },
    {
        seedKey: "addon-11-seo-extra-pages",
        listingSeedKey: "listing-10-seo",
        name: "Extra 10 pages implementation",
        amount: 90,
        deliveryDays: 5,
    },
];

export type CreateListingAddOnsResult = {
    listingAddOns: HydratedDocument<IListingAddOn>[];
    bySeedKey: Record<string, HydratedDocument<IListingAddOn>>;
};

function resolveCreatedBy(provider: IUser, listing: CreateListingsResult["bySeedKey"][string]): ObjectId {
    const fromListing = listing?.createdBy;
    if (fromListing instanceof ObjectId) {
        return fromListing;
    }
    if (fromListing && typeof fromListing === "object" && "_id" in fromListing) {
        const id = (fromListing as {_id: unknown})._id;
        if (id instanceof ObjectId) {
            return id;
        }
    }
    return provider._id;
}

export async function createListingAddOns(
    parentLogger: serverLogger,
    company: ICompany,
    provider: IUser,
    currency: ICurrency,
    listings: CreateListingsResult,
): Promise<CreateListingAddOnsResult> {
    const logger = getLogger("mongoDbInitialization-createListingAddOns", parentLogger);
    logger.start("Creating listing add-ons...");

    const listingAddOns: HydratedDocument<IListingAddOn>[] = [];
    const bySeedKey: Record<string, HydratedDocument<IListingAddOn>> = {};

    for (const seed of defaultListingAddOnSeeds) {
        try {
            const listing = listings.bySeedKey[seed.listingSeedKey];
            if (!listing) {
                logger.warn(`Skipping add-on "${seed.seedKey}": listing "${seed.listingSeedKey}" not found`);
                continue;
            }

            const seedTag = demoSeedTag(seed.seedKey);
            const displayName = demoName(seed.name);
            let existing = await ListingAddOn.findOne({
                company: company._id,
                listing: listing._id,
                name: {$in: [displayName, seed.name]},
            });

            const listingProvider = (listing as any).provider?._id ?? (listing as any).provider ?? provider._id;
            const payload = {
                listing: listing._id,
                provider: listingProvider,
                name: displayName,
                price: {
                    amount: seed.amount,
                    currency: currency._id,
                },
                ...(seed.deliveryDays !== undefined ? {deliveryDays: seed.deliveryDays} : {}),
                company: company._id,
                createdBy: resolveCreatedBy(provider, listing),
            };

            if (!existing) {
                existing = await ListingAddOn.create(payload);
                logger.debug(`Successfully created listing add-on '${seed.name}' (${seedTag})`);
            } else {
                existing.set(payload);
                await existing.save();
                logger.debug(`Listing add-on '${seed.name}' (${seedTag}) already exists; updated fields`);
            }

            await Listing.updateOne(
                {_id: listing._id},
                {$addToSet: {listingAddOns: existing._id}},
            );

            listingAddOns.push(existing);
            bySeedKey[seed.seedKey] = existing;
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            logger.err(`Error creating listing add-on '${seed.seedKey}': ${message}`);
        }
    }

    if (listingAddOns.length === 0) {
        logger.fail("Failed to create listing add-ons!");
    } else {
        logger.finish("Finished creating listing add-ons!", listingAddOns.length);
    }

    return {listingAddOns, bySeedKey};
}
