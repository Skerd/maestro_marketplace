import type {ObjectId} from "mongodb";
import {portalListedCompanyIds, type PortalScope} from "@coreModule/utilities/marketing/portalCompanies";
import MarketplaceConfig from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";

/**
 * Companies whose services the portal shows in `scope`: eligible for the marketplace (active, not deleted, with the
 * module, not hidden by the platform owner). On the apex they must also have opted in with `listedOnPortal` on their
 * marketplace settings; a company's own site shows its services without it. The platform company, which keeps the
 * portal's jobs (D197), does not run the module, so it is never one of them.
 */
export function marketplacePortalCompanyIds(scope: PortalScope): Promise<ObjectId[]> {
    return portalListedCompanyIds("marketplace", scope.companyId ? {} : {configModel: MarketplaceConfig, listedOn: {listedOnPortal: true}}, scope);
}

/** Mongo clause limiting apex browsing to the listed provider companies; orphan rows of a deleted company stay out. */
export async function liveProviderCompanyClause(): Promise<{company: {$in: ObjectId[]}}> {
    return {company: {$in: await marketplacePortalCompanyIds({})}};
}
