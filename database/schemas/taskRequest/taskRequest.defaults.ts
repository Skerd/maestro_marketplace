import dayjs from "dayjs";
import {ObjectId} from "mongodb";
import type {HydratedDocument} from "mongoose";
import TaskRequest, {type ITaskRequest, type TaskRequestStatus} from "./taskRequest";
import ListingCategory from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import {marketplaceCategoryClause} from "@marketplaceModule/utilities/services/marketplacePlatform";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {IUser} from "@coreModule/database/schemas/user/user";
import {ICurrency} from "@coreModule/database/schemas/currency/currency";
import {demoName} from "@coreModule/utilities/helpers";
import {demoSeedName, demoSeedNameCandidates} from "@coreModule/database/demo/demoSeed";
import {resolveTaskRequestPhotoIds} from "@marketplaceModule/database/demo/marketplace.demo.media";
import {jobApproxPoint} from "@marketplaceModule/utilities/services/jobLocation";
import {resolveDemoImagesFromUnsplash} from "@coreModule/database/demo/demoMedia";

export type DemoTaskAddress = {
    street: string;
    postalCode: string;
    country: ObjectId;
    state?: ObjectId;
    city: ObjectId;
    latitude: number;
    longitude: number;
};

export type TaskRequestSeed = {
    seedKey: string;
    title: string;
    description: string;
    categorySlug: string;
    /** "Up to"; left out = open budget. */
    budgetMax?: number;
    status: TaskRequestStatus;
    /** Days from now when the task expires. */
    expiresInDays: number;
};

export const defaultTaskRequestSeeds: readonly TaskRequestSeed[] = [
    {
        seedKey: "task-01-house-build",
        title: "Build a two-storey house on our plot",
        description: "We have the permit and drawings for a 140 m² house in Petrelë. Looking for a builder for the shell and roof, with the finishes quoted separately.",
        categorySlug: "build-new-builds-house",
        budgetMax: 120000,
        status: "open",
        expiresInDays: 30,
    },
    {
        seedKey: "task-02-bathroom-refit",
        title: "Renovate a small bathroom in Blloku",
        description: "4 m² bathroom from the 1990s: new tiles, a walk-in shower instead of the bath, and a hanging toilet. Fourth floor, lift available.",
        categorySlug: "build-bathrooms-renovation",
        budgetMax: 4000,
        status: "awarded",
        expiresInDays: 14,
    },
    {
        seedKey: "task-03-office-fitout",
        title: "Fit-out of a 90 m² office",
        description: "Empty office in a new building: glass partitions for two meeting rooms, suspended ceiling, flooring and paint. We want to move in within six weeks.",
        categorySlug: "build-renovation-commercial",
        status: "open",
        expiresInDays: 21,
    },
    {
        seedKey: "task-04-terrace-leak",
        title: "Terrace leaking into the flat below",
        description: "Our 35 m² terrace lets water into the neighbour's ceiling after every heavy rain. The tiles look fine; the drain may be the problem.",
        categorySlug: "build-waterproofing-terraces",
        budgetMax: 1500,
        status: "open",
        expiresInDays: 10,
    },
    {
        seedKey: "task-05-shop-strip-out",
        title: "Strip out an old shop interior",
        description: "Remove shelving, a false ceiling and floor tiles from a 60 m² shop and take the rubble away, ready for the new tenant's fit-out.",
        categorySlug: "build-demolition-strip-out",
        budgetMax: 2000,
        status: "closed",
        expiresInDays: -5,
    },
    {
        seedKey: "task-06-retaining-wall",
        title: "Retaining wall for a sloped garden",
        description: "Our garden drops two metres towards the road. We need a reinforced retaining wall about 18 m long, with drainage behind it.",
        categorySlug: "build-masonry-retaining",
        budgetMax: 3500,
        status: "open",
        expiresInDays: 45,
    },
    {
        seedKey: "task-07-attic-conversion",
        title: "Convert our attic into a bedroom",
        description: "Attic of a detached house, 32 m² floor, needs insulation, a floor, two roof windows and a staircase from the landing below.",
        categorySlug: "build-extensions-attic",
        budgetMax: 9000,
        status: "awarded",
        expiresInDays: 20,
    },
    {
        seedKey: "task-08-facade-repair",
        title: "Repair and repaint a five-storey facade",
        description: "Cracked render and peeling paint on the street side of our building (about 400 m²). The residents' association decides on the quote.",
        categorySlug: "build-facades-renovation",
        budgetMax: 12000,
        status: "open",
        expiresInDays: 28,
    },
    {
        seedKey: "task-09-kitchen-tiles",
        title: "Retile the kitchen floor and splashback",
        description: "About 14 m² of floor and 4 m² of splashback. We bought the tiles already; the old ones need to come off first.",
        categorySlug: "build-tiling-floor",
        budgetMax: 900,
        status: "open",
        expiresInDays: 18,
    },
    {
        seedKey: "task-10-steel-stairs",
        title: "Metal staircase to the roof terrace",
        description: "An outside spiral or straight steel staircase, about 3 m high, from the balcony up to the roof terrace, painted anthracite.",
        categorySlug: "build-staircases-metal",
        budgetMax: 2500,
        status: "closed",
        expiresInDays: -2,
    },
];

export type CreateTaskRequestsResult = {
    taskRequests: HydratedDocument<ITaskRequest>[];
    bySeedKey: Record<string, HydratedDocument<ITaskRequest>>;
};

/**
 * The demo customers' building jobs, posted on the apex like real ones: stored in the platform company (D197) and
 * shown on the public task board while open (D172). The buyers take turns, and none of them is a provider, so every
 * services company may quote on them.
 */
export async function createTaskRequests(
    parentLogger: serverLogger,
    platform: ICompany,
    buyers: readonly IUser[],
    currency: ICurrency,
    address: DemoTaskAddress,
): Promise<CreateTaskRequestsResult> {
    const logger = getLogger("mongoDbInitialization-createTaskRequests", parentLogger);
    logger.start("Creating task requests...");

    const taskRequests: HydratedDocument<ITaskRequest>[] = [];
    const bySeedKey: Record<string, HydratedDocument<ITaskRequest>> = {};

    try {
        for (const [index, seed] of defaultTaskRequestSeeds.entries()) {
            const requester = buyers[index % buyers.length];
            if (!requester) break;
            // Every company files under the shared tree (D144).
            const category = await ListingCategory.findOne({
                slug: seed.categorySlug,
                ...(await marketplaceCategoryClause()),
            }).select("_id");

            if (!category) {
                logger.warn(`Skipping task "${seed.title}": category "${seed.categorySlug}" not found`);
                continue;
            }

            let existing = await TaskRequest.findOne({
                company: platform._id,
                name: {$in: demoSeedNameCandidates(seed.seedKey)},
            });

            const resolved = await resolveDemoImagesFromUnsplash(
                resolveTaskRequestPhotoIds(seed.seedKey),
                seed.seedKey,
                seed.title,
                platform,
                requester._id,
                logger,
                "taskRequest",
            );
            const mainImageId = resolved.mainImageId;
            const galleryIds = resolved.galleryIds;

            // Drawn once per job, like a posted one (D148).
            const approxPoint = jobApproxPoint(address);
            const payload = {
                name: demoSeedName(seed.seedKey),
                title: demoName(seed.title),
                description: seed.description,
                category: category._id,
                requester: requester._id,
                ...(seed.budgetMax != null ? {budgetMax: seed.budgetMax} : {}),
                currency: currency._id,
                status: seed.status,
                address,
                ...(approxPoint ? {approxPoint} : {}),
                expiresAt: dayjs().add(seed.expiresInDays, "day").toDate(),
                mainImage: mainImageId,
                imageGallery: galleryIds,
                company: platform._id,
                createdBy: requester._id,
            };

            if (!existing) {
                existing = await TaskRequest.create(payload);
                logger.debug(`Successfully created task request '${payload.title}' (${seed.seedKey})`);
            } else {
                const nextName = demoSeedName(seed.seedKey);
                if (existing.name !== nextName) {
                    await TaskRequest.collection.updateOne({_id: existing._id}, {$set: {name: nextName}});
                    existing.name = nextName;
                }
                const {name: _name, ...updatable} = payload;
                existing.set(updatable);
                await existing.save();
                logger.debug(`Task request '${payload.title}' (${seed.seedKey}) already exists; updated fields`);
            }

            taskRequests.push(existing);
            bySeedKey[seed.seedKey] = existing;
        }

        logger.finish("Finished creating task requests!", defaultTaskRequestSeeds.length);
        return {taskRequests, bySeedKey};
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        logger.err(`Error creating task requests: ${message}`);
        logger.fail("Failed to create task requests!");
        return {taskRequests: [], bySeedKey: {}};
    }
}
