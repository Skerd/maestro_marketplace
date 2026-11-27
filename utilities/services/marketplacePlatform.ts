import type {ObjectId} from "mongodb";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {findPlatformCompanyId, platformRowsClause} from "@coreModule/utilities/security/platformAccess";
import {marketplaceConfigService} from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig.service";

/**
 * The platform company does the marketplace's work for every company (D197): it keeps every job posted on the portal,
 * its quotes and the job settings, where the portal's buyers already are, and decides disputes. It runs core only and
 * reaches those pages through the platform routers the marketplace records (`registerPlatformRouter`).
 */

/** The platform company's id, which keeps the portal's jobs; refused with `marketplace_unavailable` while there is none. */
export async function jobsCompanyId(languageCode: string): Promise<ObjectId> {
    const platformId = await findPlatformCompanyId();
    if (!platformId) throw apiValidationException("marketplace_unavailable", "", null, languageCode);
    return platformId;
}

/**
 * The rows of the shared service category tree (D196): the platform company's approved rows. Matches nothing while there
 * is no platform company, so no company's leftover rows ever show.
 */
export function marketplaceCategoryClause(): Promise<Record<string, unknown>> {
    return platformRowsClause();
}

/** The platform's job settings (D197), or nothing set: callers fall back to their defaults. */
export async function marketplaceJobLimits(): Promise<{leadCap?: number; openJobLimit?: number}> {
    const platformId = await findPlatformCompanyId();
    if (!platformId) return {};
    const config = await asCrossTenant("the platform's job settings apply to every portal job (D197)", () =>
        marketplaceConfigService.findOne({company: platformId}, {withDeleted: false}, null, "leadCap openJobLimit"),
    );
    return {
        ...(config?.leadCap != null ? {leadCap: config.leadCap} : {}),
        ...(config?.openJobLimit != null ? {openJobLimit: config.openJobLimit} : {}),
    };
}
