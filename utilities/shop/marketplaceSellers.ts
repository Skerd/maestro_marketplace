import type {ObjectId} from "mongodb";
import {portalListedCompanyIds, type PortalScope} from "@coreModule/utilities/marketing/portalCompanies";
import MarketplaceConfig from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";
import {findMarketplaceOperatorId} from "@marketplaceModule/utilities/services/marketplaceOperator";

/**
 * Companies whose services the portal shows in `scope`: eligible for the marketplace (active, not deleted, with the
 * module, not hidden by the platform owner). On the apex they must also have opted in with `listedOnPortal` on their
 * marketplace settings; a company's own site shows its services without it. The operator sells nothing (D143), so
 * it is never one of them, and its own site is the task board instead (D172).
 */
export async function marketplacePortalCompanyIds(scope: PortalScope): Promise<ObjectId[]> {
    const [ids, operatorId] = await Promise.all([
        portalListedCompanyIds("marketplace", scope.companyId ? {} : {configModel: MarketplaceConfig, listedOn: {listedOnPortal: true}}, scope),
        findMarketplaceOperatorId(),
    ]);
    return operatorId ? ids.filter((id) => !id.equals(operatorId)) : ids;
}

/** Mongo clause limiting apex browsing to the listed provider companies; orphan rows of a deleted company stay out. */
export async function liveProviderCompanyClause(): Promise<{company: {$in: ObjectId[]}}> {
    return {company: {$in: await marketplacePortalCompanyIds({})}};
}
