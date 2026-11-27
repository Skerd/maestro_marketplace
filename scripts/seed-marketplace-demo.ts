/**
 * One-shot: seed the services marketplace demo data (settings listed on the portal, listings with packages and
 * add-ons, task requests and bids, orders with deliveries, revisions and milestones, bookings, disputes, reviews,
 * promotions, and the escrow ledger rows) for the demo marketplace company without dropping the database. Every row is
 * keyed, so re-running adds only what is new. The demo is a construction company's (renovations, new builds, roofs,
 * facades). `--company=<name or id>` seeds another company instead, e.g. one a user created in the panel; its jobs and
 * quotes go to the platform company (D197), which keeps the portal's jobs.
 *
 * Usage (from maestro/):
 *   MONGODB_DB_NAME=xCloud-all npx ts-node --transpile-only -r tsconfig-paths/register modules/marketplace/scripts/seed-marketplace-demo.ts [--company="Brigade Ndertimi"]
 */

// The marketplace depends on finance (escrow ledger); the manifest adds it.
process.env.ENABLED_MODULES = process.env.ENABLED_MODULES || "marketplace";

import mongoose from "mongoose";
import {ObjectId} from "mongodb";
import {connectToMongoDb} from "@coreModule/connections/connectToMongoDb";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {companyService} from "@coreModule/database/schemas/company/company.service";
import {getLogger} from "@coreModule/loggers/serverLog";
import {seedCompanyDemoData} from "@marketplaceModule/database/companyDemoSeed";

async function main() {
    const logger = getLogger("seed_marketplace_demo");
    logger.start("Connecting and seeding marketplace demo data...");

    await connectToMongoDb(logger, false);

    // By VAT by default: the demo marketplace company may be renamed in the panel (e.g. "Tirana Pros").
    const named = process.argv.find((arg) => arg.startsWith("--company="))?.slice("--company=".length).trim();
    const company = named
        ? await companyService.findOne(ObjectId.isValid(named) ? {_id: new ObjectId(named)} : {name: named})
        : await companyService.findOne({vat: "Z523456789Z"});
    if (!company) {
        throw new Error(named
            ? `Company "${named}" not found.`
            : "Marketplace demo company (VAT Z523456789Z) not found — run sync:demo-companies first.");
    }

    logger.info(`Seeding against company ${company.name} (${company._id})`);
    await seedCompanyDemoData(logger, company);
    logger.finish("Marketplace demo seed complete.");
    await mongoose.disconnect();
    process.exit(0);
}

// Operator scripts span companies on purpose (D16).
asCrossTenant("a demo seed writes the marketplace company's data", main).catch(async (err) => {
    process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    try {
        await mongoose.disconnect();
    } catch {
        /* ignore */
    }
    process.exit(1);
});
