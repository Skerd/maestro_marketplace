import {ObjectId} from "mongodb";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import Currency from "@coreModule/database/schemas/currency/currency";
import Country from "@coreModule/database/schemas/country/country";
import State from "@coreModule/database/schemas/state/state";
import City from "@coreModule/database/schemas/city/city";
import User from "@coreModule/database/schemas/user/user";
import {defaultSysUsers} from "@coreModule/database/schemas/user/user.defaults";
import {defaultCompaniesValues} from "@coreModule/database/schemas/company/company.defaults";
import {createProviderProfiles} from "@marketplaceModule/database/schemas/providerProfile/providerProfile.defaults";
import {createListings, homeServiceListingSeeds} from "@marketplaceModule/database/schemas/listing/listing.defaults";
import {createListingPackages} from "@marketplaceModule/database/schemas/listingPackage/listingPackage.defaults";
import {createListingAddOns} from "@marketplaceModule/database/schemas/listingAddOn/listingAddOn.defaults";
import {createTaskRequests} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.defaults";
import {createBids} from "@marketplaceModule/database/schemas/bid/bid.defaults";
import {createOrders} from "@marketplaceModule/database/schemas/order/order.defaults";
import {createOrderDeliveries} from "@marketplaceModule/database/schemas/orderDelivery/orderDelivery.defaults";
import {createOrderRevisions} from "@marketplaceModule/database/schemas/orderRevision/orderRevision.defaults";
import {createOrderMilestones} from "@marketplaceModule/database/schemas/orderMilestone/orderMilestone.defaults";
import {createListingFlags} from "@marketplaceModule/database/schemas/listingFlag/listingFlag.defaults";
import {createReviews} from "@marketplaceModule/database/schemas/review/review.defaults";
import {createDisputes} from "@marketplaceModule/database/schemas/dispute/dispute.defaults";
import {createBookings} from "@marketplaceModule/database/schemas/booking/booking.defaults";
import {createPromotions} from "@marketplaceModule/database/schemas/promotion/promotion.defaults";
import {createEscrowTransactions} from "@marketplaceModule/database/demo/escrowTransactions.demo";

/**
 * The main user (echo@echo.com) is both the provider and the buyer, so every
 * marketplace demo row is visible from one login. Invoked from
 * {@link seedCompanyDemoData} after the product catalog seed.
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
    const country = await Country.findOne({code: addr.countryCode, company: company._id}).select("_id");
    const state = await State.findOne({code: addr.stateCode, company: company._id}).select("_id");
    const city = await City.findOne({name: addr.cityName, company: company._id}).select("_id");

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
        (await Currency.findOne({abbreviation: "EUR", company: company._id})) ||
        (await Currency.findOne({company: company._id}));
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

    let taskRequests = {taskRequests: [], bySeedKey: {}} as Awaited<ReturnType<typeof createTaskRequests>>;
    if (demoAddress) {
        taskRequests = await createTaskRequests(logger, company, customer, currency, {
            street: demoAddress.street,
            postalCode: demoAddress.postalCode,
            country: demoAddress.country,
            state: demoAddress.state,
            city: demoAddress.city,
            latitude: demoAddress.latitude,
            longitude: demoAddress.longitude,
        });
    } else {
        logger.warn("Skipping task requests — Tirana geo not resolved.");
    }

    const bids = await createBids(logger, company, provider, currency, taskRequests);
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
    await createListingFlags(logger, company, customer, listings);
    // The escrow ledger hangs off these orders (the marketplace depends on finance, not the other way round).
    await createEscrowTransactions(logger, company, orders);

    logger.finish("Finished seeding marketplace demo data!");
}
