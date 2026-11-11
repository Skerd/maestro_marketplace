import type {HydratedDocument} from "mongoose";
import {ObjectId} from "mongodb";
import Listing, {type IListing, type ListingStatus, type PricingType} from "./listing";
import ListingCategory from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {IUser} from "@coreModule/database/schemas/user/user";
import {ICurrency} from "@coreModule/database/schemas/currency/currency";
import {demoName} from "@coreModule/utilities/helpers";
import {demoSeedTag} from "@coreModule/database/demo/demoSeed";
import {resolveListingPhotoIds} from "@marketplaceModule/database/demo/marketplace.demo.media";
import {resolveDemoImagesFromUnsplash} from "@coreModule/database/demo/demoMedia";

/** Address a seeded listing advertises; omitted when the geo seeds did not resolve. */
export type DemoListingAddress = {
    country: ObjectId;
    state?: ObjectId;
    city: ObjectId;
};

export type ListingSeed = {
    seedKey: string;
    title: string;
    description: string;
    categorySlug: string;
    price: number;
    pricingType: PricingType;
    deliveryDays: number;
    status: ListingStatus;
    tags: readonly string[];
    requirements: readonly string[];
    faqs: readonly {question: string; answer: string}[];
};

export const defaultListingSeeds: readonly ListingSeed[] = [
    {
        seedKey: "listing-01-logo-design",
        title: "Professional Logo Design",
        description:
            "I will create a unique, modern logo for your brand. Includes 3 initial concepts, unlimited revisions within scope, and delivery in vector and raster formats.",
        categorySlug: "design-logo-branding",
        price: 99,
        pricingType: "fixed",
        deliveryDays: 5,
        status: "active",
        tags: ["logo", "branding", "design", "identity"],
        requirements: [
            "Brand name",
            "Brief description of your business",
            "Preferred colors or style references",
        ],
        faqs: [
            {
                question: "How many revisions are included?",
                answer: "Three revision rounds are included. Additional revisions can be purchased as an add-on.",
            },
            {
                question: "What file formats will I receive?",
                answer: "You will receive PNG, JPG, SVG, and PDF exports suitable for print and web.",
            },
        ],
    },
    {
        seedKey: "listing-02-website-dev",
        title: "Website Development",
        description:
            "Full-stack website development with React and Node.js. Responsive design, SEO-friendly markup, and deployment assistance included.",
        // The live database still carries the pre-rename slug "website-development";
        // the category seeds ship "dev-website".
        categorySlug: "dev-website",
        price: 500,
        pricingType: "fixed",
        deliveryDays: 14,
        status: "active",
        tags: ["web", "react", "nodejs", "full-stack"],
        requirements: ["Project brief or sitemap", "Brand assets if available", "Hosting preferences"],
        faqs: [
            {
                question: "Do you provide hosting setup?",
                answer: "Yes, I can deploy to Vercel, Netlify, or your preferred VPS and document the handoff.",
            },
        ],
    },
    {
        seedKey: "listing-03-blog-writing",
        title: "Blog Article Writing",
        description:
            "SEO-optimized blog articles of 1000+ words, researched and tailored to your audience. Includes meta title and description suggestions.",
        categorySlug: "writing-articles",
        price: 50,
        pricingType: "fixed",
        deliveryDays: 3,
        status: "draft",
        tags: ["writing", "seo", "blog", "content"],
        requirements: [
            "Target keyword or topic",
            "Tone of voice guidelines",
            "Internal links to promote if any",
        ],
        faqs: [
            {
                question: "Do you handle keyword research?",
                answer: "Yes — basic keyword research is included. Deeper competitive analysis is available as an add-on.",
            },
            {
                question: "Can you match our brand voice?",
                answer: "Share a style guide or 2–3 sample posts and I will mirror tone and terminology.",
            },
        ],
    },
    {
        seedKey: "listing-04-social-media",
        title: "Social Media Marketing Package",
        description:
            "Monthly social media management: content calendar, 12 post designs, caption copy, and basic performance reporting for one platform.",
        categorySlug: "marketing-social",
        price: 200,
        pricingType: "fixed",
        deliveryDays: 7,
        status: "active",
        tags: ["social-media", "marketing", "instagram", "content"],
        requirements: [
            "Brand guidelines",
            "Access to social accounts or assets",
            "Primary platform focus",
        ],
        faqs: [
            {
                question: "Which platforms do you support?",
                answer: "Instagram, Facebook, LinkedIn, and TikTok. This package covers one primary platform.",
            },
        ],
    },
    {
        seedKey: "listing-05-video-editing",
        title: "Professional Video Editing",
        description:
            "Edit your raw footage into a polished video with color correction, sound leveling, subtitles, and motion graphics where needed.",
        categorySlug: "video-editing",
        price: 150,
        pricingType: "fixed",
        deliveryDays: 4,
        status: "active",
        tags: ["video", "editing", "youtube", "reels"],
        requirements: ["Raw footage via cloud link", "Script or outline", "Reference videos for style"],
        faqs: [
            {
                question: "What is the max runtime?",
                answer: "Up to 10 minutes for the base package. Longer edits can be quoted as an add-on.",
            },
            {
                question: "Do you include music licensing?",
                answer: "Royalty-free tracks are included. Premium licensed tracks are available separately.",
            },
        ],
    },
    {
        seedKey: "listing-06-voice-over",
        title: "Professional Voice Over",
        description:
            "Native English voice over for commercials, explainers, and e-learning. Clean studio recording with one revision round included.",
        categorySlug: "audio-voiceover",
        price: 75,
        pricingType: "fixed",
        deliveryDays: 2,
        status: "inactive",
        tags: ["voiceover", "audio", "narration", "commercial"],
        requirements: [
            "Final script",
            "Pronunciation guide for names",
            "Desired tone (warm, corporate, energetic)",
        ],
        faqs: [
            {
                question: "Which accents can you deliver?",
                answer: "Neutral US and UK English by default; other accents on request.",
            },
            {
                question: "What file formats are included?",
                answer: "WAV and MP3 masters, plus a dry take without music bed.",
            },
        ],
    },
    {
        seedKey: "listing-07-virtual-assistant",
        title: "Virtual Assistant — Hourly",
        description:
            "Reliable virtual assistant for inbox management, scheduling, data entry, and light research. Billed hourly with weekly timesheets.",
        categorySlug: "biz-virtual-assistant",
        price: 25,
        pricingType: "hourly",
        deliveryDays: 1,
        status: "active",
        tags: ["virtual-assistant", "admin", "productivity", "remote"],
        requirements: ["List of recurring tasks", "Tool access instructions", "Preferred working hours"],
        faqs: [
            {
                question: "What tools do you work in?",
                answer: "Gmail, Outlook, Notion, Slack, Asana, HubSpot, and common spreadsheets.",
            },
            {
                question: "Is there a minimum weekly commitment?",
                answer: "Five hours per week minimum so onboarding stays efficient.",
            },
        ],
    },
    {
        seedKey: "listing-08-product-photo",
        title: "Product Photography & Retouching",
        description:
            "Studio-style product photos on white or lifestyle backgrounds, with professional retouching for e-commerce listings.",
        categorySlug: "photo-product",
        price: 120,
        pricingType: "fixed",
        deliveryDays: 6,
        status: "active",
        tags: ["photography", "product", "ecommerce", "retouching"],
        requirements: [
            "Physical products shipped or local drop-off",
            "Shot list or SKU list",
            "Marketplace size requirements",
        ],
        faqs: [
            {
                question: "How many SKUs are included?",
                answer: "Up to 10 SKUs with 3 angles each in the base package.",
            },
            {
                question: "Do you ship products back?",
                answer: "Yes — return shipping is billed at cost after the shoot.",
            },
        ],
    },
    {
        seedKey: "listing-09-mobile-apps",
        title: "React Native Mobile App Development",
        description:
            "Cross-platform iOS and Android app development with React Native, including API integration, auth flows, and App Store submission support.",
        categorySlug: "dev-mobile",
        price: 800,
        pricingType: "fixed",
        deliveryDays: 21,
        status: "active",
        tags: ["mobile", "react-native", "ios", "android"],
        requirements: [
            "Wireframes or Figma designs",
            "API documentation",
            "Apple/Google developer account access",
        ],
        faqs: [
            {
                question: "Is backend development included?",
                answer: "This listing covers the mobile client. Backend can be scoped separately or integrated if an API already exists.",
            },
        ],
    },
    {
        seedKey: "listing-10-seo",
        title: "SEO Audit & Optimization",
        description:
            "Comprehensive on-page SEO audit with actionable recommendations, keyword mapping, and implementation of priority fixes on up to 10 pages.",
        categorySlug: "marketing-seo",
        price: 180,
        pricingType: "fixed",
        deliveryDays: 5,
        status: "active",
        tags: ["seo", "marketing", "audit", "google"],
        requirements: [
            "Website URL",
            "Google Search Console access if available",
            "Primary target keywords",
        ],
        faqs: [
            {
                question: "Will you implement the fixes?",
                answer: "Priority on-page fixes for up to 10 pages are included. Larger implementation can be scoped separately.",
            },
            {
                question: "Do you guarantee rankings?",
                answer: "No — SEO outcomes depend on competition and ongoing content. The deliverable is a clear, prioritized action plan.",
            },
        ],
    },
];

export type CreateListingsResult = {
    listings: HydratedDocument<IListing>[];
    bySeedKey: Record<string, HydratedDocument<IListing>>;
};

/**
 * Seeds the marketplace demo listings for a company.
 *
 * Idempotent: each listing carries `demo-seed:<seedKey>` in `tags`, which is the
 * lookup key on re-runs — `name` is auto-generated by the schema and cannot be used.
 * Images come from Unsplash kits (same flow as product catalog media).
 */
export async function createListings(
    parentLogger: serverLogger,
    company: ICompany,
    provider: IUser,
    currency: ICurrency,
    address?: DemoListingAddress,
): Promise<CreateListingsResult> {
    const logger = getLogger("mongoDbInitialization-createListings", parentLogger);
    logger.start("Creating listings...");

    const listings: HydratedDocument<IListing>[] = [];
    const bySeedKey: Record<string, HydratedDocument<IListing>> = {};

    for (const seed of defaultListingSeeds) {
        try {
            const category = await ListingCategory.findOne({
                slug: seed.categorySlug,
                company: company._id,
            }).select("_id");

            if (!category) {
                logger.warn(`Skipping listing "${seed.title}": category "${seed.categorySlug}" not found`);
                continue;
            }

            const seedTag = demoSeedTag(seed.seedKey);
            let existing = await Listing.findOne({company: company._id, tags: seedTag});

            const resolved = await resolveDemoImagesFromUnsplash(
                resolveListingPhotoIds(seed.seedKey),
                seed.seedKey,
                seed.title,
                company,
                provider._id as ObjectId,
                logger,
                "listing",
            );
            const mainImageId = resolved.mainImageId;
            const galleryIds = resolved.galleryIds;

            const payload = {
                title: demoName(seed.title),
                description: seed.description,
                category: category._id,
                provider: provider._id,
                price: seed.price,
                priceCurrency: currency._id,
                pricingType: seed.pricingType,
                deliveryDays: seed.deliveryDays,
                status: seed.status,
                ...(address ? {address} : {}),
                mainImage: mainImageId,
                imageGallery: galleryIds,
                faqs: seed.faqs.map((faq) => ({...faq})),
                requirements: [...seed.requirements],
                tags: [...seed.tags, seedTag],
                company: company._id,
                createdBy: provider._id,
            };

            if (!existing) {
                existing = await Listing.create(payload);
                logger.debug(`Successfully created listing '${payload.title}' (${seedTag})`);
            } else {
                existing.set(payload);
                await existing.save();
                logger.debug(`Listing '${payload.title}' (${seedTag}) already exists; updated fields`);
            }

            listings.push(existing);
            bySeedKey[seed.seedKey] = existing;
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            logger.err(`Error creating listing '${seed.seedKey}': ${message}`);
        }
    }

    if (listings.length === 0) {
        logger.fail("Failed to create listings!");
    } else {
        logger.finish("Finished creating listings!", listings.length);
    }

    return {listings, bySeedKey};
}
