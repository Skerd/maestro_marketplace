import {findPlatformCompanyId} from "@coreModule/utilities/security/platformAccess";
import {ObjectId} from "mongodb";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import Currency from "@coreModule/database/schemas/currency/currency";
import Country from "@coreModule/database/schemas/country/country";
import State from "@coreModule/database/schemas/state/state";
import City from "@coreModule/database/schemas/city/city";
import Company from "@coreModule/database/schemas/company/company";
import User from "@coreModule/database/schemas/user/user";
import {CORE_DEMO_CUSTOMER_PASSWORD, coreDemoCustomerSeeds, createDemoSignupUsers} from "@coreModule/database/demo/demoSignupUsers";
import {defaultSysUsers} from "@coreModule/database/schemas/user/user.defaults";
import {defaultCompaniesValues} from "@coreModule/database/schemas/company/company.defaults";
import {createProviderProfiles} from "@marketplaceModule/database/schemas/providerProfile/providerProfile.defaults";
import {createListings, homeServiceListingSeeds} from "@marketplaceModule/database/schemas/listing/listing.defaults";
import {createListingPackages} from "@marketplaceModule/database/schemas/listingPackage/listingPackage.defaults";
import {createListingAddOns} from "@marketplaceModule/database/schemas/listingAddOn/listingAddOn.defaults";
import {createTaskRequests, type CreateTaskRequestsResult} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.defaults";
import {createBids, type CreateBidsResult} from "@marketplaceModule/database/schemas/bid/bid.defaults";
import {createOrders} from "@marketplaceModule/database/schemas/order/order.defaults";
import {createOrderDeliveries} from "@marketplaceModule/database/schemas/orderDelivery/orderDelivery.defaults";
import {createOrderRevisions} from "@marketplaceModule/database/schemas/orderRevision/orderRevision.defaults";
import {createOrderMilestones} from "@marketplaceModule/database/schemas/orderMilestone/orderMilestone.defaults";
import {createReviews} from "@marketplaceModule/database/schemas/review/review.defaults";
import {createDisputes} from "@marketplaceModule/database/schemas/dispute/dispute.defaults";
import {createBookings} from "@marketplaceModule/database/schemas/booking/booking.defaults";
import {createPromotions} from "@marketplaceModule/database/schemas/promotion/promotion.defaults";
import {createEscrowTransactions} from "@marketplaceModule/database/demo/escrowTransactions.demo";
import {CARD_PAYMENTS_AVAILABLE} from "armonia/src/modules/finance/helpers/cardPaymentAvailability";
import {seedTaskBoardDemo} from "@marketplaceModule/database/demo/taskBoardDemo";

/**
 * The main user (echo@echo.com) is the provider and the buyer of the listing orders, so most marketplace demo rows
 * are visible from one login. The online jobs are the portal demo customers' (Arta, Luca, Nina) on the public task
 * board, since nobody may quote on their own job (D172). Invoked from {@link seedCompanyDemoData} after the product
 * catalog seed.
 */
/** The demo home-repair provider ("Adria Home Fix" in the core company seed), which gets the on-site kit. */
const HOME_SERVICES_DEMO_VAT = "Z623456789Z";

async function resolveDemoUser(company: any, logger: serverLogger) {
    const mainUsername = defaultSysUsers.find((u) => u.isMainUser)?.username;
    const user =
        (mainUsername ? await User.findOne({username: mainUsername}) : null) ||
        (await User.findById(company.createdBy));

    if (!user) {
        logger.err("Could not resolve the demo user for marketplace demo.");
    }
    return user;
}

async function resolveDemoAddress(company: any, logger: serverLogger) {
    const addr = defaultCompaniesValues.address;
    const country = await Country.findOne({code: addr.countryCode}).select("_id");
    const state = country ? await State.findOne({country: country._id, code: addr.stateCode}).select("_id") : null;
    const city = country ? await City.findOne({country: country._id, name: addr.cityName}).select("_id") : null;

    if (!country || !city) {
        logger.warn(
            `Marketplace demo address incomplete (country=${Boolean(country)}, city=${Boolean(city)}); listings/tasks may omit geo.`,
        );
        return null;
    }

    return {
        country: country._id as ObjectId,
        state: (state?._id as ObjectId) || undefined,
        city: city._id as ObjectId,
        street: addr.street,
        postalCode: addr.postalCode,
        latitude: addr.geoLocation.latitude,
        longitude: addr.geoLocation.longitude,
    };
}

export async function seedMarketplaceCompanyDemoData(parentLogger: serverLogger | undefined, company: any): Promise<void> {
    const logger = getLogger("marketplace_company_demo_seed", parentLogger);
    logger.start("Seeding marketplace demo data...");

    const currency =
        (await Currency.findOne({abbreviation: "EUR"})) ||
        (await Currency.findOne({}));
    if (!currency) {
        logger.err("No currency found; skipping marketplace demo.");
        logger.fail("Marketplace demo seed failed.");
        return;
    }

    const user = await resolveDemoUser(company, logger);
    if (!user) {
        logger.fail("Marketplace demo seed failed.");
        return;
    }
    const provider = user;
    const customer = user;

    await createProviderProfiles(logger, company, provider);
    if (company.vat === HOME_SERVICES_DEMO_VAT) {
        // The home-repair provider only advertises on-site services with their service areas (D143).
        await createListings(logger, company, provider, currency, undefined, homeServiceListingSeeds);
        // The last services company in the seed list: the platform company and Tirana Pros exist now, so the public task
        // board's workflows can be seeded across them (D172).
        await seedTaskBoardDemo(logger, company);
        logger.finish("Finished seeding marketplace demo data!");
        return;
    }

    const demoAddress = await resolveDemoAddress(company, logger);
    const listingAddress =
        demoAddress?.state != null
            ? {country: demoAddress.country, state: demoAddress.state, city: demoAddress.city}
            : undefined;

    const listings = await createListings(logger, company, provider, currency, listingAddress);
    await createListingPackages(logger, company, provider, currency, listings);
    await createListingAddOns(logger, company, provider, currency, listings);

    // Jobs are posted on the apex by portal customers and stored in the platform company, where this company
    // quotes on them like any provider (D172, D197); the order after an award opens here.
    const platformId = await findPlatformCompanyId();
    const platform = platformId ? await Company.findById(platformId) : null;
    // The buyers are the core demo customers, portal accounts of the platform company; a company set up by hand (the
    // seed script's `--company`) may come before them, so they join the platform here. Never this company's own user,
    // who quotes on the jobs.
    if (platform) await createDemoSignupUsers(logger, platform, coreDemoCustomerSeeds, CORE_DEMO_CUSTOMER_PASSWORD);
    const demoCustomers = await User.find({username: {$in: coreDemoCustomerSeeds.map((seed) => seed.username)}});
    const buyers = coreDemoCustomerSeeds.flatMap((seed) => demoCustomers.filter((user) => user.username === seed.username));
    let taskRequests: CreateTaskRequestsResult = {taskRequests: [], bySeedKey: {}};
    let bids: CreateBidsResult = {bids: [], bySeedKey: {}};
    if (demoAddress && platform && buyers.length) {
        taskRequests = await createTaskRequests(logger, platform, buyers, currency, {
            street: demoAddress.street,
            postalCode: demoAddress.postalCode,
            country: demoAddress.country,
            state: demoAddress.state,
            city: demoAddress.city,
            latitude: demoAddress.latitude,
            longitude: demoAddress.longitude,
        });
        bids = await createBids(logger, platform, company, provider, currency, taskRequests);
    } else {
        logger.warn("Skipping task requests — Tirana geo, the platform company or its demo customers not found.");
    }

    const orders = await createOrders(
        logger,
        company,
        customer,
        provider,
        currency,
        listings,
        taskRequests,
        bids,
    );
    // Deliveries first — revisions hang off the one left in `revision_requested`.
    const deliveries = await createOrderDeliveries(logger, company, provider, orders);
    await createOrderRevisions(logger, company, customer, orders, deliveries);
    await createOrderMilestones(logger, company, customer, currency, orders);

    await createReviews(logger, company, customer, orders, listings);
    await createDisputes(logger, company, customer, orders);
    await createBookings(logger, company, provider, orders);
    await createPromotions(logger, company, listings);
    // The escrow ledger hangs off these orders (the marketplace depends on finance, not the other way round). While card
    // payments are off nothing is held, so the demo shows no escrow either (D190).
    if (CARD_PAYMENTS_AVAILABLE) await createEscrowTransactions(logger, company, orders);

    logger.finish("Finished seeding marketplace demo data!");
}
