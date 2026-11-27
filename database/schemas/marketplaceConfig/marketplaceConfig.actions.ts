import {action} from "@coreModule/api/actionDecorator";
import {getModelCollectedData} from "@coreModule/database/collections";
import SchemaGuard from "@coreModule/database/security/schemaGuard";
import type {MarketplaceConfig as MarketplaceConfigDto} from "armonia/src/modules/marketplace/api/marketplace/private/marketplaceConfig/marketplaceConfig.dto";
import MarketplaceConfig from "./marketplaceConfig";
import {marketplaceConfigService} from "./marketplaceConfig.service";
import {marketplaceConfigToDTO} from "@marketplaceModule/utilities/mappers/marketplaceConfig/marketplaceConfigMapper.dto";

export class MarketplaceConfigActions {
    /** Get-or-create the company's marketplace settings; used by the settings page. */
    @action({auth: "private", rateLimit: {windowMs: 60000, max: 60}, transaction: true})
    async ensure(params: Record<string, any>): Promise<MarketplaceConfigDto> {
        const {logger, languageCode, session, actionUserCtx, company} = params;

        const doc = await marketplaceConfigService.getOrCreateForCompany(company._id, {
            session,
            logger,
            languageCode,
            auditUserId: actionUserCtx.userId,
        });

        const readFields = SchemaGuard.sanitizeFields(
            MarketplaceConfig,
            getModelCollectedData("marketplaceconfigs").readFields!,
            "read",
            actionUserCtx,
            languageCode,
        );
        const populate = SchemaGuard.generatePopulate(readFields, MarketplaceConfig.schema);
        const populated = await marketplaceConfigService.findById(doc._id, {session, logger, languageCode}, populate.populate);
        return marketplaceConfigToDTO(populated ?? doc);
    }
}
