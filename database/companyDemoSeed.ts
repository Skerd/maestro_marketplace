import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {seedMarketplaceCompanyDemoData} from "@marketplaceModule/database/demo/marketplaceCompanyDemoSeed";
import {createEscrowTransactions} from "@marketplaceModule/database/demo/escrowTransactions.demo";
import {marketplaceConfigService} from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig.service";
import {MARKETPLACE_OPERATOR_VAT} from "@marketplaceModule/utilities/services/marketplaceOperator";

/**
 * Runs after the core and finance seeds. Seeds the marketplace settings (listed on the portal), the listings, task
 * requests and service orders, then the escrow ledger rows that hang off those orders (the marketplace depends on
 * finance, not the other way round). The marketplace operator only gets its settings, marked as the operator.
 */
export const companyDemoSeedOrder = 35;

export async function seedCompanyDemoData(parentLogger: serverLogger | undefined, company: any): Promise<void> {
    const logger = getLogger("marketplace_company_demo_seed", parentLogger);
    const config = await marketplaceConfigService.getOrCreateForCompany(company._id, {logger});
    if (company.vat === MARKETPLACE_OPERATOR_VAT) {
        // The operator sells nothing: it is marked, stays off the seller list, and gets no listings or orders (D143).
        if (!config.isOperator) await marketplaceConfigService.updateById(config._id, {isOperator: true}, {logger});
        return;
    }
    if (!config.listedOnPortal) await marketplaceConfigService.updateById(config._id, {listedOnPortal: true}, {logger});
    await seedMarketplaceCompanyDemoData(parentLogger, company);
    await createEscrowTransactions(logger, company);
}
