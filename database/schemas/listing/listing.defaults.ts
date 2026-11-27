import type {HydratedDocument} from "mongoose";
import {ObjectId} from "mongodb";
import Listing, {type IListing, type ListingStatus, type PricingType} from "./listing";
import ListingCategory from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import {marketplaceCategoryClause} from "@marketplaceModule/utilities/services/marketplaceOperator";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {IUser} from "@coreModule/database/schemas/user/user";
import {ICurrency} from "@coreModule/database/schemas/currency/currency";
import {demoName} from "@coreModule/utilities/helpers";
import {demoSeedTag} from "@coreModule/database/demo/demoSeed";
import {resolveListingPhotoIds} from "@marketplaceModule/database/demo/marketplace.demo.media";
import {resolveDemoImagesFromUnsplash} from "@coreModule/database/demo/demoMedia";
import Country from "@coreModule/database/schemas/country/country";
import City from "@coreModule/database/schemas/city/city";
import {listingServiceAreaFields} from "@marketplaceModule/utilities/services/serviceArea";

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
    /** On-site work (D143): the city the listing advertises and the area the provider covers from a pin. */
    place?: {cityName: string; latitude: number; longitude: number; radiusKm: number};
};

const DURRES = {cityName: "Durrës", latitude: 41.3231, longitude: 19.4414};
const TIRANA = {cityName: "Tirana", latitude: 41.3275, longitude: 19.8187};

/**
 * A construction company's services (the demo brigade, e.g. "Brigade Ndertimi"): building work done on site around
 * Tirana and Durrës, each with its service area (D143), filed under the platform's Construction & Renovation section.
 */
export const defaultListingSeeds: readonly ListingSeed[] = [
    {
        seedKey: "listing-01-apartment-renovation",
        title: "Turnkey Apartment Renovation",
        description:
            "Full renovation of your apartment by one crew: strip-out, new wiring and plumbing, plastering, screed, tiles, doors and paint. One site manager, one schedule and one price for the whole job, handed over clean.",
        categorySlug: "build-renovation-apartment",
        price: 14000,
        pricingType: "fixed",
        deliveryDays: 60,
        status: "active",
        tags: ["renovation", "apartment", "turnkey", "interior"],
        requirements: ["Floor plan or the apartment's size in m²", "Photos of every room", "The building administrator's rules for works"],
        faqs: [
            {
                question: "What does the price include?",
                answer: "Labour, standard materials and waste removal for an apartment up to 70 m². Tiles, sanitaryware and doors you choose above the standard range are charged at cost.",
            },
            {
                question: "Can we live in the apartment during the works?",
                answer: "Not during strip-out and installations (about three weeks). The finishing stage can be planned room by room.",
            },
        ],
        place: {...TIRANA, radiusKm: 30},
    },
    {
        seedKey: "listing-02-bathroom-renovation",
        title: "Complete Bathroom Renovation",
        description:
            "Old tiles and fittings out, new pipes, waterproofing, wall and floor tiles, sanitaryware and a walk-in shower or bath. Most bathrooms are finished in two weeks.",
        categorySlug: "build-bathrooms-renovation",
        price: 3200,
        pricingType: "fixed",
        deliveryDays: 14,
        status: "active",
        tags: ["bathroom", "renovation", "tiling", "shower"],
        requirements: ["Bathroom size and photos", "Whether you keep the current layout", "Your choice of tiles and fittings, or a budget for them"],
        faqs: [
            {
                question: "Is waterproofing included?",
                answer: "Yes. Floors and shower walls get a liquid membrane with taped corners before tiling, every time.",
            },
            {
                question: "Who buys the tiles and sanitaryware?",
                answer: "You can choose them yourself or we order them with our trade discount. Either way we check quantities before work starts.",
            },
        ],
        place: {...TIRANA, radiusKm: 35},
    },
    {
        seedKey: "listing-03-kitchen-renovation",
        title: "Kitchen Renovation and Fitting",
        description:
            "We remove the old kitchen, move water and power points where the new layout needs them, level walls, tile the splashback and fit the units and worktop.",
        categorySlug: "build-kitchens-renovation",
        price: 4200,
        pricingType: "fixed",
        deliveryDays: 21,
        status: "draft",
        tags: ["kitchen", "renovation", "fitting", "worktop"],
        requirements: ["Kitchen plan with measurements", "Appliance list", "Unit supplier, if you already chose one"],
        faqs: [
            {
                question: "Do you make the kitchen units?",
                answer: "We fit units from any supplier. Made-to-measure units are quoted with our carpenter after the site visit.",
            },
        ],
        place: {...TIRANA, radiusKm: 30},
    },
    {
        seedKey: "listing-04-house-shell",
        title: "House Shell Construction",
        description:
            "Foundations, reinforced concrete frame, slabs, block walls and the roof structure for houses up to 200 m², built to your architect's drawings and the building permit.",
        categorySlug: "build-new-builds-shell",
        price: 38000,
        pricingType: "fixed",
        deliveryDays: 120,
        status: "active",
        tags: ["new build", "house", "shell", "concrete"],
        requirements: ["Building permit", "Architectural and structural drawings", "Site access for a concrete pump"],
        faqs: [
            {
                question: "How is the price calculated?",
                answer: "The listed price is for a 120 m² two-storey house. Larger houses are quoted from the structural drawings.",
            },
            {
                question: "Who supervises the work?",
                answer: "Our site engineer runs the crew every day; your supervising engineer signs off each concrete pour.",
            },
        ],
        place: {...TIRANA, radiusKm: 60},
    },
    {
        seedKey: "listing-05-tiling",
        title: "Floor and Wall Tiling",
        description:
            "Ceramic, porcelain and large-format tiles laid level on floors and walls, with clean grout lines and silicone. Surface preparation and levelling included.",
        categorySlug: "build-tiling-floor",
        price: 22,
        pricingType: "hourly",
        deliveryDays: 5,
        status: "active",
        tags: ["tiling", "floor", "porcelain", "walls"],
        requirements: ["Area in m²", "Tile size and type", "Photos of the current floor"],
        faqs: [
            {
                question: "Do you lay large slabs?",
                answer: "Yes, up to 120×280 cm with a suction lifting frame and a two-person crew.",
            },
        ],
        place: {...DURRES, radiusKm: 40},
    },
    {
        seedKey: "listing-06-plastering",
        title: "Interior Plastering and Skim Coating",
        description:
            "Walls and ceilings plastered or skimmed smooth, ready for paint. Cracks, old wallpaper marks and uneven corners repaired first.",
        categorySlug: "build-plastering-interior",
        price: 18,
        pricingType: "hourly",
        deliveryDays: 7,
        status: "inactive",
        tags: ["plastering", "skim coat", "walls", "ceilings"],
        requirements: ["Rooms and their size", "Whether the walls are painted or bare"],
        faqs: [
            {
                question: "How long before we can paint?",
                answer: "Skim coat is dry in two to three days; fresh plaster needs about a week, depending on the weather.",
            },
        ],
        place: {...TIRANA, radiusKm: 30},
    },
    {
        seedKey: "listing-07-masonry-crew",
        title: "Masonry Crew: Brick and Block Walls",
        description:
            "A crew of three builds new partition and external walls in brick or block, door and window openings with lintels included. Booked by the hour, quoted for bigger jobs.",
        categorySlug: "build-masonry-walls",
        price: 30,
        pricingType: "hourly",
        deliveryDays: 3,
        status: "active",
        tags: ["masonry", "brick", "block", "walls", "crew"],
        requirements: ["Wall lengths and heights", "Brick or block type", "Drawings if the wall is structural"],
        faqs: [
            {
                question: "Is the rate per person?",
                answer: "No, the hourly rate is for the whole crew of three, mortar mixer included.",
            },
            {
                question: "Do you bring the materials?",
                answer: "We can order blocks, cement and sand to the site; they are invoiced at cost with the delivery.",
            },
        ],
        place: {...TIRANA, radiusKm: 40},
    },
    {
        seedKey: "listing-08-roof-repair",
        title: "Roof Repair and Leak Fixing",
        description:
            "Broken and slipped tiles replaced, flashing and valleys resealed, and the leak traced to its source. Photos of the roof before and after the repair.",
        categorySlug: "build-roofing-repair",
        price: 450,
        pricingType: "fixed",
        deliveryDays: 4,
        status: "active",
        tags: ["roof", "leak", "tiles", "repair"],
        requirements: ["Where the water comes in", "Roof type (tiles, sheet or flat)", "Building height"],
        faqs: [
            {
                question: "Do you come after a storm?",
                answer: "Yes. Emergency covering with a tarpaulin is possible the same day; the repair follows in dry weather.",
            },
        ],
        place: {...DURRES, radiusKm: 50},
    },
    {
        seedKey: "listing-09-terrace-waterproofing",
        title: "Terrace and Flat Roof Waterproofing",
        description:
            "Old membrane removed where needed, cracks sealed and a new bituminous or liquid membrane laid with proper falls to the drains. Ten-year written warranty.",
        categorySlug: "build-waterproofing-terraces",
        price: 1500,
        pricingType: "fixed",
        deliveryDays: 7,
        status: "active",
        tags: ["waterproofing", "terrace", "flat roof", "membrane"],
        requirements: ["Terrace size in m²", "Photos of the surface and the drains", "Where the damp shows below"],
        faqs: [
            {
                question: "Does the tiling come off?",
                answer: "Only if the membrane under it has failed. We test first and can often coat over sound tiles with a transparent system.",
            },
        ],
        place: {...TIRANA, radiusKm: 40},
    },
    {
        seedKey: "listing-10-facade-insulation",
        title: "Facade Thermal Insulation",
        description:
            "External wall insulation with EPS or mineral wool boards, mesh, render and a coloured finish, scaffolding included. Lower heating bills and no more cold walls.",
        categorySlug: "build-insulation-external",
        price: 8500,
        pricingType: "fixed",
        deliveryDays: 30,
        status: "active",
        tags: ["insulation", "facade", "energy", "render"],
        requirements: ["Facade area or building photos from every side", "Number of floors", "The residents' approval for blocks of flats"],
        faqs: [
            {
                question: "How thick is the insulation?",
                answer: "8 cm EPS by default; 10 to 12 cm or mineral wool on request, priced per m².",
            },
            {
                question: "Is the scaffolding included?",
                answer: "Yes, for buildings up to four floors. Higher buildings are quoted with rope access or a mast climber.",
            },
        ],
        place: {...TIRANA, radiusKm: 40},
    },
];

/** A home-repair provider's on-site services around Durrës and Tirana (D143): each has a service area. */
export const homeServiceListingSeeds: readonly ListingSeed[] = [
    {
        seedKey: "home-01-leaks",
        title: "Leaking Tap and Pipe Repairs",
        description: "Dripping taps, leaking pipes under the sink and loose fittings fixed the same day. I bring the common washers, cartridges and seals with me.",
        categorySlug: "home-plumbing-leaks",
        price: 30,
        pricingType: "fixed",
        deliveryDays: 1,
        status: "active",
        tags: ["plumbing", "leak", "tap", "faucet"],
        requirements: ["Where the leak is", "A photo of the tap or pipe if you can"],
        faqs: [{question: "Are parts included?", answer: "Standard washers and seals are included. Larger parts such as a new mixer tap are charged at cost."}],
        place: {...DURRES, radiusKm: 30},
    },
    {
        seedKey: "home-02-drains",
        title: "Blocked Drain and Toilet Clearing",
        description: "Blocked sinks, showers and toilets cleared with a drain snake or pressure jet, and the cause explained so it does not come back.",
        categorySlug: "home-plumbing-drains",
        price: 45,
        pricingType: "fixed",
        deliveryDays: 1,
        status: "active",
        tags: ["plumbing", "drain", "blockage"],
        requirements: ["Which drain is blocked", "Whether water is backing up"],
        faqs: [{question: "Do you come at night?", answer: "Emergency visits are possible until 22:00 for an extra fee."}],
        place: {...DURRES, radiusKm: 30},
    },
    {
        seedKey: "home-03-boilers",
        title: "Water Heater Service and Repair",
        description: "Electric and gas water heaters serviced, descaled and repaired. Thermostat, element and valve replacements on the spot.",
        categorySlug: "home-plumbing-boilers",
        price: 25,
        pricingType: "hourly",
        deliveryDays: 2,
        status: "active",
        tags: ["boiler", "water heater", "plumbing"],
        requirements: ["Brand and model of the heater", "What it does wrong"],
        faqs: [{question: "Do you install new heaters?", answer: "Yes. The installation is quoted after a short visit."}],
        place: {...TIRANA, radiusKm: 20},
    },
    {
        seedKey: "home-04-electrical",
        title: "Electrical Faults, Sockets and Lighting",
        description: "Tripping fuses, dead sockets and new light fittings handled by a licensed electrician. Safety check of the fuse box included.",
        categorySlug: "home-electrical",
        price: 28,
        pricingType: "hourly",
        deliveryDays: 2,
        status: "active",
        tags: ["electrician", "sockets", "lighting"],
        requirements: ["What stopped working", "Photos of the fuse box if possible"],
        faqs: [{question: "Are you licensed?", answer: "Yes, and every job comes with a written report of what was done."}],
        place: {...TIRANA, radiusKm: 20},
    },
    {
        seedKey: "home-05-cleaning",
        title: "Deep Cleaning for Flats and Houses",
        description: "Kitchen, bathroom and floor deep cleaning with our own products and equipment. Move-in and move-out cleans too.",
        categorySlug: "home-cleaning",
        price: 15,
        pricingType: "hourly",
        deliveryDays: 3,
        status: "active",
        tags: ["cleaning", "deep clean", "move out"],
        requirements: ["Size of the home", "Rooms to clean"],
        faqs: [{question: "Do I need to be home?", answer: "No, as long as someone can let us in and lock up after."}],
        place: {...TIRANA, radiusKm: 15},
    },
    {
        seedKey: "home-06-handyman",
        title: "Handyman: Shelves, Doors and Small Fixes",
        description: "Shelves and curtain rails put up, sticking doors planed, furniture assembled and the small jobs on your list done in one visit.",
        categorySlug: "home-handyman",
        price: 20,
        pricingType: "hourly",
        deliveryDays: 3,
        status: "active",
        tags: ["handyman", "assembly", "repairs"],
        requirements: ["A list of the jobs", "Photos if helpful"],
        faqs: [{question: "Is there a minimum?", answer: "One hour is the minimum visit."}],
        place: {...DURRES, radiusKm: 40},
    },
];

export type CreateListingsResult = {
    listings: HydratedDocument<IListing>[];
    bySeedKey: Record<string, HydratedDocument<IListing>>;
};

/** The address and service area of an on-site demo listing, from the platform's country and city lists (D160). */
async function onsitePlace(categoryId: ObjectId, place: NonNullable<ListingSeed["place"]>) {
    const country = await Country.findOne({code: "AL"}).select("_id");
    const city = country ? await City.findOne({country: country._id, name: place.cityName}).select("_id") : null;
    const area = await listingServiceAreaFields(categoryId, place, "en-US", {});
    return {
        address: country && city ? {country: country._id as ObjectId, city: city._id as ObjectId} : undefined,
        serviceArea: area.serviceArea ?? undefined,
        serviceAreaPoint: area.serviceAreaPoint ?? undefined,
    };
}

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
    seeds: readonly ListingSeed[] = defaultListingSeeds,
): Promise<CreateListingsResult> {
    const logger = getLogger("mongoDbInitialization-createListings", parentLogger);
    logger.start("Creating listings...");

    const listings: HydratedDocument<IListing>[] = [];
    const bySeedKey: Record<string, HydratedDocument<IListing>> = {};

    for (const seed of seeds) {
        try {
            // Every company files under the shared tree (D144).
            const category = await ListingCategory.findOne({
                slug: seed.categorySlug,
                ...(await marketplaceCategoryClause()),
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

            // An on-site seed advertises its own city and gets its service area through the listing rule (D143).
            const place = seed.place ? await onsitePlace(category._id, seed.place) : undefined;

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
                ...(place ? {address: place.address, serviceArea: place.serviceArea, serviceAreaPoint: place.serviceAreaPoint} : address ? {address} : {}),
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
