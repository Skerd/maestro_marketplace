import type {HydratedDocument} from "mongoose";
import {ObjectId} from "mongodb";
import ListingPackage, {type IListingPackage} from "./listingPackage";
import Listing from "@marketplaceModule/database/schemas/listing/listing";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {IUser} from "@coreModule/database/schemas/user/user";
import {ICurrency} from "@coreModule/database/schemas/currency/currency";
import {demoName} from "@coreModule/utilities/helpers";
import {demoSeedTag} from "@coreModule/database/demo/demoSeed";
import type {CreateListingsResult} from "@marketplaceModule/database/schemas/listing/listing.defaults";

export type ListingPackageSeed = {
    seedKey: string;
    listingSeedKey: string;
    name: string;
    description: string;
    amount: number;
    deliveryDays: number;
    order: number;
};

export const defaultListingPackageSeeds: readonly ListingPackageSeed[] = [
    {
        seedKey: "package-01-logo-basic",
        listingSeedKey: "listing-01-logo-design",
        name: "Basic",
        description: "One logo concept, 1 revision, PNG and JPG exports.",
        amount: 79,
        deliveryDays: 4,
        order: 0,
    },
    {
        seedKey: "package-02-logo-standard",
        listingSeedKey: "listing-01-logo-design",
        name: "Standard",
        description: "Three concepts, 3 revisions, vector and raster formats.",
        amount: 99,
        deliveryDays: 5,
        order: 1,
    },
    {
        seedKey: "package-03-logo-premium",
        listingSeedKey: "listing-01-logo-design",
        name: "Premium",
        description: "Five concepts, unlimited revisions within scope, brand style sheet.",
        amount: 149,
        deliveryDays: 7,
        order: 2,
    },
    {
        seedKey: "package-04-website-starter",
        listingSeedKey: "listing-02-website-dev",
        name: "Starter Site",
        description: "Up to 5 pages, responsive layout, contact form integration.",
        amount: 400,
        deliveryDays: 10,
        order: 0,
    },
    {
        seedKey: "package-05-website-business",
        listingSeedKey: "listing-02-website-dev",
        name: "Business Site",
        description: "Up to 12 pages, CMS, SEO setup, and deployment.",
        amount: 500,
        deliveryDays: 14,
        order: 1,
    },
    {
        seedKey: "package-06-blog-single",
        listingSeedKey: "listing-03-blog-writing",
        name: "Single Article",
        description: "One SEO-optimized article, 1000+ words.",
        amount: 50,
        deliveryDays: 3,
        order: 0,
    },
    {
        seedKey: "package-07-social-starter",
        listingSeedKey: "listing-04-social-media",
        name: "Starter Pack",
        description: "8 post templates and captions for one platform.",
        amount: 150,
        deliveryDays: 5,
        order: 0,
    },
    {
        seedKey: "package-08-video-short",
        listingSeedKey: "listing-05-video-editing",
        name: "Short Edit",
        description: "Up to 60 seconds, color correction and basic sound mix.",
        amount: 120,
        deliveryDays: 3,
        order: 0,
    },
    {
        seedKey: "package-09-mobile-mvp",
        listingSeedKey: "listing-09-mobile-apps",
        name: "MVP Build",
        description: "Core screens, auth, and API integration for one platform.",
        amount: 650,
        deliveryDays: 18,
        order: 0,
    },
    {
        seedKey: "package-10-seo-starter",
        listingSeedKey: "listing-10-seo",
        name: "Starter Audit",
        description: "Audit of up to 5 pages with prioritized fix list.",
        amount: 150,
        deliveryDays: 4,
        order: 0,
    },
    {
        seedKey: "package-11-voice-standard",
        listingSeedKey: "listing-06-voice-over",
        name: "Standard VO",
        description: "Up to 150 words, studio WAV/MP3, one revision round.",
        amount: 75,
        deliveryDays: 2,
        order: 0,
    },
    {
        seedKey: "package-12-assistant-weekly",
        listingSeedKey: "listing-07-virtual-assistant",
        name: "Weekly Block (10h)",
        description: "Ten hours of VA time with same-day Slack responses during business hours.",
        amount: 250,
        deliveryDays: 7,
        order: 0,
    },
    {
        seedKey: "package-13-photo-catalog",
        listingSeedKey: "listing-08-product-photo",
        name: "Catalog Pack",
        description: "Up to 10 SKUs, 3 angles each, white-background retouching included.",
        amount: 120,
        deliveryDays: 6,
        order: 0,
    },
];

export type CreateListingPackagesResult = {
    listingPackages: HydratedDocument<IListingPackage>[];
    bySeedKey: Record<string, HydratedDocument<IListingPackage>>;
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

export async function createListingPackages(
    parentLogger: serverLogger,
    company: ICompany,
    provider: IUser,
    currency: ICurrency,
    listings: CreateListingsResult,
): Promise<CreateListingPackagesResult> {
    const logger = getLogger("mongoDbInitialization-createListingPackages", parentLogger);
    logger.start("Creating listing packages...");

    const listingPackages: HydratedDocument<IListingPackage>[] = [];
    const bySeedKey: Record<string, HydratedDocument<IListingPackage>> = {};

    for (const seed of defaultListingPackageSeeds) {
        try {
            const listing = listings.bySeedKey[seed.listingSeedKey];
            if (!listing) {
                logger.warn(`Skipping package "${seed.seedKey}": listing "${seed.listingSeedKey}" not found`);
                continue;
            }

            const seedTag = demoSeedTag(seed.seedKey);
            const displayName = demoName(seed.name);
            let existing = await ListingPackage.findOne({
                company: company._id,
                listing: listing._id,
                name: {$in: [displayName, seed.name]},
            });

            const listingProvider = (listing as any).provider?._id ?? (listing as any).provider ?? provider._id;
            const payload = {
                listing: listing._id,
                provider: listingProvider,
                name: displayName,
                description: seed.description,
                price: {
                    amount: seed.amount,
                    currency: currency._id,
                },
                deliveryDays: seed.deliveryDays,
                order: seed.order,
                company: company._id,
                createdBy: resolveCreatedBy(provider, listing),
            };

            if (!existing) {
                existing = await ListingPackage.create(payload);
                logger.debug(`Successfully created listing package '${seed.name}' (${seedTag})`);
            } else {
                existing.set(payload);
                await existing.save();
                logger.debug(`Listing package '${seed.name}' (${seedTag}) already exists; updated fields`);
            }

            await Listing.updateOne(
                {_id: listing._id},
                {$addToSet: {listingPackages: existing._id}},
            );

            listingPackages.push(existing);
            bySeedKey[seed.seedKey] = existing;
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            logger.err(`Error creating listing package '${seed.seedKey}': ${message}`);
        }
    }

    if (listingPackages.length === 0) {
        logger.fail("Failed to create listing packages!");
    } else {
        logger.finish("Finished creating listing packages!", listingPackages.length);
    }

    return {listingPackages, bySeedKey};
}
