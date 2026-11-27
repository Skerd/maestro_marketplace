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
        seedKey: "addon-01-design-3d",
        listingSeedKey: "listing-01-apartment-renovation",
        name: "Interior design with 3D views",
        amount: 900,
        deliveryDays: 10,
    },
    {
        seedKey: "addon-02-final-clean",
        listingSeedKey: "listing-01-apartment-renovation",
        name: "Final deep clean before handover",
        amount: 250,
        deliveryDays: 1,
    },
    {
        seedKey: "addon-03-underfloor-heating",
        listingSeedKey: "listing-02-bathroom-renovation",
        name: "Electric underfloor heating",
        amount: 380,
        deliveryDays: 2,
    },
    {
        seedKey: "addon-04-worktop-stone",
        listingSeedKey: "listing-03-kitchen-renovation",
        name: "Quartz worktop instead of laminate",
        amount: 650,
        deliveryDays: 5,
    },
    {
        seedKey: "addon-05-site-survey",
        listingSeedKey: "listing-04-house-shell",
        name: "Topographic survey of the plot",
        amount: 400,
        deliveryDays: 3,
    },
    {
        seedKey: "addon-06-skirting",
        listingSeedKey: "listing-05-tiling",
        name: "Tiled skirting along every wall",
        amount: 120,
        deliveryDays: 1,
    },
    {
        seedKey: "addon-07-paint-ready",
        listingSeedKey: "listing-06-plastering",
        name: "Primer coat, ready for paint",
        amount: 90,
        deliveryDays: 1,
    },
    {
        seedKey: "addon-08-waste-removal",
        listingSeedKey: "listing-07-masonry-crew",
        name: "Rubble removal with a skip",
        amount: 180,
        deliveryDays: 1,
    },
    {
        seedKey: "addon-09-gutter-clean",
        listingSeedKey: "listing-08-roof-repair",
        name: "Gutter and downpipe cleaning",
        amount: 80,
        deliveryDays: 1,
    },
    {
        seedKey: "addon-10-tile-finish",
        listingSeedKey: "listing-09-terrace-waterproofing",
        name: "New terrace tiles over the membrane",
        amount: 1100,
        deliveryDays: 6,
    },
    {
        seedKey: "addon-11-window-reveals",
        listingSeedKey: "listing-10-facade-insulation",
        name: "Insulated window reveals and new sills",
        amount: 950,
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
