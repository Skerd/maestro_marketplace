import type {ObjectId} from "mongodb";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {companyService} from "@coreModule/database/schemas/company/company.service";
import {isModuleEnabledForCompany} from "@coreModule/utilities/modules/companyModules";
import {marketplaceConfigService} from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig.service";

/**
 * The seeded marketplace operator, "Arpeggio Services" in the core company seed (D143). Only the seed uses it, to mark
 * that company's settings as the operator's; everything else finds the operator through `MarketplaceConfig.isOperator`.
 */
export const MARKETPLACE_OPERATOR_VAT = "Z000000001Z";

/** The operator company's id, or undefined while no company is marked as the operator. */
export async function findMarketplaceOperatorId(): Promise<ObjectId | undefined> {
    const config = await asCrossTenant("one marketplace operator serves every portal buyer", () =>
        marketplaceConfigService.findOne({isOperator: true}, {withDeleted: false}, null, "company"),
    );
    return config ? nestedEntityToRef(config.company) : undefined;
}

/**
 * The operator company, which owns the shared categories and the jobs posted on the portal. Fails closed with
 * `marketplace_unavailable` when there is none, or it is inactive or lacks the module: a job is never written anywhere else.
 */
export async function marketplaceOperatorCompanyId(languageCode: string): Promise<ObjectId> {
    const operatorId = await findMarketplaceOperatorId();
    const operator = operatorId ? await companyService.findById(operatorId, {}, [], "isActive modules") : null;
    if (!operator || operator.isActive !== true || !isModuleEnabledForCompany(operator, "marketplace")) {
        throw apiValidationException("marketplace_unavailable", "", null, languageCode);
    }
    return operator._id;
}
