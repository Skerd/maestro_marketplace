import ListingCategory, { type IListingCategory } from "./listingCategory";
import { getLogger, serverLogger } from "@coreModule/loggers/serverLog";
import { ICompany } from "@coreModule/database/schemas/company/company";
import { demoName } from "@coreModule/utilities/helpers";
import type { HydratedDocument } from "mongoose";

export type CategorySeed = {
    name: string;
    slug: string;
    order: number;
    /** Parent category slug (same company). Roots omit this. */
    parentSlug?: string;
};

/**
 * Marketplace-style category tree (similar breadth to large gig / services platforms).
 * Root slugs `design-creative`, `development-it`, `writing-translation` are stable anchors for demo seeders.
 */
const defaultListingCategorySeeds: readonly CategorySeed[] = [
    // --- Top-level (no parent) ---
    { name: "Graphics & Design", slug: "design-creative", order: 1 },
    { name: "Programming & Tech", slug: "development-it", order: 2 },
    { name: "Writing & Translation", slug: "writing-translation", order: 3 },
    { name: "Digital Marketing", slug: "digital-marketing", order: 4 },
    { name: "Video & Animation", slug: "video-animation", order: 5 },
    { name: "Music & Audio", slug: "music-audio", order: 6 },
    { name: "Business", slug: "business", order: 7 },
    { name: "Photography", slug: "photography", order: 8 },
    { name: "Data & AI", slug: "data-ai", order: 9 },
    { name: "Lifestyle", slug: "lifestyle", order: 10 },

    // --- Graphics & Design ---
    { name: "Logo & Brand Identity", slug: "design-logo-branding", order: 1, parentSlug: "design-creative" },
    { name: "Web & App Design", slug: "design-web-app", order: 2, parentSlug: "design-creative" },
    { name: "UX & Product Design", slug: "design-ux-product", order: 3, parentSlug: "design-creative" },
    { name: "Illustration", slug: "design-illustration", order: 4, parentSlug: "design-creative" },
    { name: "Packaging & Labels", slug: "design-packaging", order: 5, parentSlug: "design-creative" },
    { name: "Print Design", slug: "design-print", order: 6, parentSlug: "design-creative" },
    { name: "Architecture & Interior Design", slug: "design-architecture", order: 7, parentSlug: "design-creative" },
    { name: "Fashion & Jewelry Design", slug: "design-fashion", order: 8, parentSlug: "design-creative" },
    { name: "Presentation Design", slug: "design-presentations", order: 9, parentSlug: "design-creative" },

    // --- Programming & Tech ---
    { name: "Website Development", slug: "dev-website", order: 1, parentSlug: "development-it" },
    { name: "Mobile Apps", slug: "dev-mobile", order: 2, parentSlug: "development-it" },
    { name: "eCommerce Development", slug: "dev-ecommerce", order: 3, parentSlug: "development-it" },
    { name: "Software Development", slug: "dev-software", order: 4, parentSlug: "development-it" },
    { name: "Game Development", slug: "dev-games", order: 5, parentSlug: "development-it" },
    { name: "Cloud & DevOps", slug: "dev-cloud-devops", order: 6, parentSlug: "development-it" },
    { name: "Cybersecurity", slug: "dev-security", order: 7, parentSlug: "development-it" },
    { name: "QA & Testing", slug: "dev-qa", order: 8, parentSlug: "development-it" },
    { name: "Databases & Backend", slug: "dev-databases", order: 9, parentSlug: "development-it" },
    { name: "AI Apps & Integration", slug: "dev-ai-integration", order: 10, parentSlug: "development-it" },

    // --- Writing & Translation ---
    { name: "Articles & Blog Posts", slug: "writing-articles", order: 1, parentSlug: "writing-translation" },
    { name: "Translation & Localization", slug: "writing-translation-service", order: 2, parentSlug: "writing-translation" },
    { name: "Proofreading & Editing", slug: "writing-proofreading", order: 3, parentSlug: "writing-translation" },
    { name: "Sales Copy & Content", slug: "writing-copywriting", order: 4, parentSlug: "writing-translation" },
    { name: "Technical Writing", slug: "writing-technical", order: 5, parentSlug: "writing-translation" },
    { name: "Creative Writing", slug: "writing-creative", order: 6, parentSlug: "writing-translation" },

    // --- Digital Marketing ---
    { name: "Social Media Marketing", slug: "marketing-social", order: 1, parentSlug: "digital-marketing" },
    { name: "Search Engine Optimization (SEO)", slug: "marketing-seo", order: 2, parentSlug: "digital-marketing" },
    { name: "Content Marketing", slug: "marketing-content", order: 3, parentSlug: "digital-marketing" },
    { name: "Email Marketing", slug: "marketing-email", order: 4, parentSlug: "digital-marketing" },
    { name: "Paid Advertising", slug: "marketing-ads", order: 5, parentSlug: "digital-marketing" },
    { name: "Influencer & Partnership Marketing", slug: "marketing-influencer", order: 6, parentSlug: "digital-marketing" },
    { name: "Analytics & Growth", slug: "marketing-analytics", order: 7, parentSlug: "digital-marketing" },

    // --- Video & Animation ---
    { name: "Video Editing", slug: "video-editing", order: 1, parentSlug: "video-animation" },
    { name: "Animation & Motion Graphics", slug: "video-motion", order: 2, parentSlug: "video-animation" },
    { name: "Filming & Video Production", slug: "video-production", order: 3, parentSlug: "video-animation" },
    { name: "Intros & Outros", slug: "video-intros", order: 4, parentSlug: "video-animation" },
    { name: "Subtitles & Captions", slug: "video-captions", order: 5, parentSlug: "video-animation" },

    // --- Music & Audio ---
    { name: "Voice Over", slug: "audio-voiceover", order: 1, parentSlug: "music-audio" },
    { name: "Music Production & Composing", slug: "audio-music", order: 2, parentSlug: "music-audio" },
    { name: "Podcast Editing & Production", slug: "audio-podcast", order: 3, parentSlug: "music-audio" },
    { name: "Sound Design", slug: "audio-sound-design", order: 4, parentSlug: "music-audio" },
    { name: "Mixing & Mastering", slug: "audio-mixing", order: 5, parentSlug: "music-audio" },

    // --- Business ---
    { name: "Virtual Assistant", slug: "biz-virtual-assistant", order: 1, parentSlug: "business" },
    { name: "Market Research", slug: "biz-research", order: 2, parentSlug: "business" },
    { name: "Financial Consulting", slug: "biz-finance", order: 3, parentSlug: "business" },
    { name: "Legal Consulting", slug: "biz-legal", order: 4, parentSlug: "business" },
    { name: "Business Plans & Pitch Decks", slug: "biz-plans", order: 5, parentSlug: "business" },
    { name: "HR & Recruitment", slug: "biz-hr", order: 6, parentSlug: "business" },
    { name: "Project Management", slug: "biz-pm", order: 7, parentSlug: "business" },

    // --- Photography ---
    { name: "Product Photography", slug: "photo-product", order: 1, parentSlug: "photography" },
    { name: "Portrait & Events", slug: "photo-portrait", order: 2, parentSlug: "photography" },
    { name: "Real Estate & Spaces", slug: "photo-realestate", order: 3, parentSlug: "photography" },
    { name: "Photo Editing & Retouching", slug: "photo-editing", order: 4, parentSlug: "photography" },

    // --- Data & AI ---
    { name: "Data Analysis & Visualization", slug: "data-analysis", order: 1, parentSlug: "data-ai" },
    { name: "Data Entry & Annotation", slug: "data-entry", order: 2, parentSlug: "data-ai" },
    { name: "AI Services", slug: "data-ai-services", order: 3, parentSlug: "data-ai" },

    // --- Lifestyle ---
    { name: "Online Tutoring & Lessons", slug: "life-tutoring", order: 1, parentSlug: "lifestyle" },
    { name: "Fitness & Wellness Coaching", slug: "life-fitness", order: 2, parentSlug: "lifestyle" },
    { name: "Gaming & Coaching", slug: "life-gaming", order: 3, parentSlug: "lifestyle" },
    { name: "Crafts & Handmade", slug: "life-crafts", order: 4, parentSlug: "lifestyle" },
];

const ANCHOR_SLUGS = ["design-creative", "development-it", "writing-translation"] as const;

function assertAcyclicSortedSeeds(seeds: readonly CategorySeed[]): CategorySeed[] {
    const bySlug = new Map(seeds.map((s) => [s.slug, s]));
    const sorted: CategorySeed[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();

    function visit(slug: string) {
        if (visited.has(slug)) return;
        if (visiting.has(slug)) {
            throw new Error(`createCategories: category seeds contain a cycle at slug "${slug}"`);
        }
        visiting.add(slug);
        const s = bySlug.get(slug);
        if (!s) {
            throw new Error(`createCategories: unknown slug "${slug}" in category seeds`);
        }
        if (s.parentSlug) {
            if (!bySlug.has(s.parentSlug)) {
                throw new Error(
                    `createCategories: parentSlug "${s.parentSlug}" not found for category "${slug}"`,
                );
            }
            visit(s.parentSlug);
        }
        visiting.delete(slug);
        visited.add(slug);
        sorted.push(s);
    }

    for (const s of seeds) {
        visit(s.slug);
    }
    return sorted;
}

/**
 * Ensures default marketplace categories exist for the company (upsert by `company` + `slug`).
 * Inserts roots before children; sets `parentListingCategory` from resolved parent slug.
 * Returns the three legacy anchor categories for downstream demo seed data (listings, tasks, etc.).
 */
export async function createCategories(
    parentLogger: serverLogger,
    company: ICompany,
): Promise<{ catDesign: IListingCategory; catDev: IListingCategory; catWriting: IListingCategory }> {
    const logger = getLogger("mongoDbInitialization-createCategories", parentLogger);
    logger.start("Creating categories...");

    // One-time rename: legacy `parent` → `parentListingCategory`
    await ListingCategory.collection.updateMany(
        {parent: {$exists: true}, parentListingCategory: {$exists: false}},
        [{$set: {parentListingCategory: "$parent"}}, {$unset: "parent"}],
    );

    const orderedSeeds = assertAcyclicSortedSeeds(defaultListingCategorySeeds);
    const parentIdBySlug = new Map<string, HydratedDocument<IListingCategory>["_id"]>();

    for (const seed of orderedSeeds) {
        try {
            let parentId: HydratedDocument<IListingCategory>["_id"] | undefined;
            if (seed.parentSlug) {
                const resolved = parentIdBySlug.get(seed.parentSlug);
                if (!resolved) {
                    const parentDoc = await ListingCategory.findOne({
                        slug: seed.parentSlug,
                        company: company._id,
                    }).select("_id");
                    if (!parentDoc) {
                        throw new Error(
                            `Parent category "${seed.parentSlug}" not found when seeding "${seed.slug}"`,
                        );
                    }
                    parentId = parentDoc._id;
                    parentIdBySlug.set(seed.parentSlug, parentId);
                } else {
                    parentId = resolved;
                }
            }

            const baseSet = {
                name: demoName(seed.name),
                slug: seed.slug,
                order: seed.order,
            };

            const result = await ListingCategory.updateOne(
                {
                    slug: seed.slug,
                    company: company._id,
                },
                parentId
                    ? {
                          $set: {
                              ...baseSet,
                              parentListingCategory: parentId,
                          },
                          $setOnInsert: {
                              company: company._id,
                              createdBy: company.createdBy,
                          },
                      }
                    : {
                          $set: baseSet,
                          $unset: { parentListingCategory: 1, parent: 1 },
                          $setOnInsert: {
                              company: company._id,
                              createdBy: company.createdBy,
                          },
                      },
                { upsert: true },
            );

            const doc = await ListingCategory.findOne({
                slug: seed.slug,
                company: company._id,
            }).select("_id parentListingCategory");

            if (doc?._id) {
                parentIdBySlug.set(seed.slug, doc._id);
            }

            if (result.upsertedCount > 0) {
                logger.info(`Successfully created category '${seed.name}' (${seed.slug})`);
            } else {
                logger.info(`Category '${seed.name}' (${seed.slug}) already exists; updated fields`);
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            logger.err(`Error creating category '${seed.name}': ${message}`);
        }
    }

    const docs = await ListingCategory.find({
        company: company._id,
        slug: { $in: [...ANCHOR_SLUGS] },
    });

    const bySlug = new Map(docs.map((d) => [d.slug, d]));
    const catDesign = bySlug.get("design-creative");
    const catDev = bySlug.get("development-it");
    const catWriting = bySlug.get("writing-translation");

    if (!catDesign || !catDev || !catWriting) {
        logger.fail("Failed to resolve anchor categories after upsert");
        throw new Error("createCategories: missing anchor category documents after upsert");
    }

    logger.finish("Finished creating categories!", defaultListingCategorySeeds.length);
    return { catDesign, catDev, catWriting };
}
