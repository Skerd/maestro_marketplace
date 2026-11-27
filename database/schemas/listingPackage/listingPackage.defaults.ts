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
        seedKey: "package-01-renovation-refresh",
        listingSeedKey: "listing-01-apartment-renovation",
        name: "Refresh",
        description: "Paint, new flooring and doors; kitchen and bathroom kept as they are.",
        amount: 7500,
        deliveryDays: 30,
        order: 0,
    },
    {
        seedKey: "package-02-renovation-full",
        listingSeedKey: "listing-01-apartment-renovation",
        name: "Full Renovation",
        description: "Strip-out, new installations, plaster, tiles, doors and paint for up to 70 m².",
        amount: 14000,
        deliveryDays: 60,
        order: 1,
    },
    {
        seedKey: "package-03-renovation-premium",
        listingSeedKey: "listing-01-apartment-renovation",
        name: "Premium Turnkey",
        description: "Full renovation plus interior design, made-to-measure joinery and a final deep clean.",
        amount: 21000,
        deliveryDays: 75,
        order: 2,
    },
    {
        seedKey: "package-04-bathroom-standard",
        listingSeedKey: "listing-02-bathroom-renovation",
        name: "Standard Bathroom",
        description: "Same layout, new tiles, fittings, bath or shower tray, up to 5 m².",
        amount: 3200,
        deliveryDays: 14,
        order: 0,
    },
    {
        seedKey: "package-05-bathroom-walk-in",
        listingSeedKey: "listing-02-bathroom-renovation",
        name: "Walk-in Shower Bathroom",
        description: "Level-access shower with linear drain, glass screen and full waterproofing.",
        amount: 4300,
        deliveryDays: 18,
        order: 1,
    },
    {
        seedKey: "package-06-kitchen-refit",
        listingSeedKey: "listing-03-kitchen-renovation",
        name: "Kitchen Refit",
        description: "Removal, new water and power points, splashback tiling and fitting of your units.",
        amount: 4200,
        deliveryDays: 21,
        order: 0,
    },
    {
        seedKey: "package-07-shell-120",
        listingSeedKey: "listing-04-house-shell",
        name: "Shell up to 120 m²",
        description: "Foundations, frame, slabs, walls and roof structure for a two-storey house up to 120 m².",
        amount: 38000,
        deliveryDays: 120,
        order: 0,
    },
    {
        seedKey: "package-08-tiling-30",
        listingSeedKey: "listing-05-tiling",
        name: "Up to 30 m²",
        description: "Levelling and tiling of one floor or a bathroom, grout and silicone included.",
        amount: 660,
        deliveryDays: 4,
        order: 0,
    },
    {
        seedKey: "package-09-terrace-50",
        listingSeedKey: "listing-09-terrace-waterproofing",
        name: "Terrace up to 50 m²",
        description: "Crack repair, primer and a two-layer membrane with drains resealed.",
        amount: 1500,
        deliveryDays: 7,
        order: 0,
    },
    {
        seedKey: "package-10-facade-200",
        listingSeedKey: "listing-10-facade-insulation",
        name: "Facade up to 200 m²",
        description: "8 cm EPS, mesh, render and colour finish with scaffolding.",
        amount: 8500,
        deliveryDays: 30,
        order: 0,
    },
    {
        seedKey: "package-11-plaster-room",
        listingSeedKey: "listing-06-plastering",
        name: "One Room",
        description: "Walls and ceiling of one room up to 20 m² skimmed smooth.",
        amount: 290,
        deliveryDays: 3,
        order: 0,
    },
    {
        seedKey: "package-12-masonry-week",
        listingSeedKey: "listing-07-masonry-crew",
        name: "Crew Week (40h)",
        description: "The three-person crew for a full week, mixer and scaffold towers included.",
        amount: 1200,
        deliveryDays: 7,
        order: 0,
    },
    {
        seedKey: "package-13-roof-inspect-repair",
        listingSeedKey: "listing-08-roof-repair",
        name: "Inspection and Repair",
        description: "Roof inspection with photos and the repair of up to 15 tiles and one flashing.",
        amount: 450,
        deliveryDays: 4,
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
