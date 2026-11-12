import dayjs from "dayjs";
import {ObjectId} from "mongodb";
import type {HydratedDocument} from "mongoose";
import TaskRequest, {type ITaskRequest, type TaskRequestStatus} from "./taskRequest";
import ListingCategory from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import {marketplaceCategoryClause} from "@marketplaceModule/utilities/services/marketplaceOperator";
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
        seedKey: "task-01-mobile-app",
        title: "Need a mobile app developer",
        description: "Looking for an experienced React Native developer for a fitness tracking app with wearables integration.",
        categorySlug: "dev-mobile",
        budgetMax: 5000,
        status: "open",
        expiresInDays: 30,
    },
    {
        seedKey: "task-02-social-graphics",
        title: "Social media graphics for coffee shop",
        description: "Need 10 Instagram post templates and 5 story templates for a new specialty coffee brand launch.",
        categorySlug: "design-logo-branding",
        budgetMax: 200,
        status: "awarded",
        expiresInDays: 14,
    },
    {
        seedKey: "task-03-ecommerce-setup",
        title: "Shopify store setup and theme customization",
        description: "Set up a Shopify store with 50 products, payment gateways, and a custom theme aligned to our brand guide.",
        categorySlug: "dev-ecommerce",
        status: "open",
        expiresInDays: 21,
    },
    {
        seedKey: "task-04-seo-audit",
        title: "SEO audit for SaaS landing pages",
        description: "Technical and on-page SEO audit for 8 marketing landing pages with prioritized fix list.",
        categorySlug: "marketing-seo",
        budgetMax: 350,
        status: "open",
        expiresInDays: 10,
    },
    {
        seedKey: "task-05-product-video",
        title: "Product launch video (60 seconds)",
        description: "Script, shoot, and edit a 60-second product video for a smart home device crowdfunding campaign.",
        categorySlug: "video-production",
        budgetMax: 1200,
        status: "closed",
        expiresInDays: -5,
    },
    {
        seedKey: "task-06-podcast-editing",
        title: "Weekly podcast editing (4 episodes)",
        description: "Edit four 45-minute podcast episodes per month: noise reduction, intro/outro, and show notes summary.",
        categorySlug: "audio-podcast",
        budgetMax: 400,
        status: "open",
        expiresInDays: 45,
    },
    {
        seedKey: "task-07-business-plan",
        title: "Investor-ready business plan",
        description: "Write a 25-page business plan with financial projections for a B2B marketplace startup.",
        categorySlug: "biz-plans",
        budgetMax: 900,
        status: "awarded",
        expiresInDays: 20,
    },
    {
        seedKey: "task-08-wordpress-migration",
        title: "WordPress to headless CMS migration",
        description: "Migrate 120 blog posts and media library from WordPress to a headless stack with redirects.",
        categorySlug: "dev-website",
        budgetMax: 1100,
        status: "open",
        expiresInDays: 28,
    },
    {
        seedKey: "task-09-brand-identity",
        title: "Full brand identity package",
        description: "Logo, color palette, typography, and brand guidelines for a sustainable fashion label.",
        categorySlug: "design-logo-branding",
        budgetMax: 700,
        status: "open",
        expiresInDays: 18,
    },
    {
        seedKey: "task-10-data-dashboard",
        title: "Sales analytics dashboard in Looker Studio",
        description: "Connect Shopify and Google Analytics data into an executive dashboard with weekly KPI views.",
        categorySlug: "data-analysis",
        budgetMax: 600,
        status: "closed",
        expiresInDays: -2,
    },
];

export type CreateTaskRequestsResult = {
    taskRequests: HydratedDocument<ITaskRequest>[];
    bySeedKey: Record<string, HydratedDocument<ITaskRequest>>;
};

export async function createTaskRequests(
    parentLogger: serverLogger,
    company: ICompany,
    requester: IUser,
    currency: ICurrency,
    address: DemoTaskAddress,
): Promise<CreateTaskRequestsResult> {
    const logger = getLogger("mongoDbInitialization-createTaskRequests", parentLogger);
    logger.start("Creating task requests...");

    const taskRequests: HydratedDocument<ITaskRequest>[] = [];
    const bySeedKey: Record<string, HydratedDocument<ITaskRequest>> = {};

    try {
        for (const seed of defaultTaskRequestSeeds) {
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
                company: company._id,
                name: {$in: demoSeedNameCandidates(seed.seedKey)},
            });

            const resolved = await resolveDemoImagesFromUnsplash(
                resolveTaskRequestPhotoIds(seed.seedKey),
                seed.seedKey,
                seed.title,
                company,
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
                company: company._id,
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
