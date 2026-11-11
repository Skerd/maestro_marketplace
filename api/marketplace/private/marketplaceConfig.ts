import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {buildCreateDataFromSchemaDef, buildUpdateDataFromSchemaDef} from "@coreModule/api/buildUpdateDataFromSchemaDef";
import {MarketplaceConfigSchemaDef} from "armonia/src/modules/marketplace/api/marketplace/private/marketplaceConfig/marketplaceConfig.schema-def";
import {createMarketplaceConfigFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/marketplaceConfig/createMarketplaceConfig.form.validator";
import {editMarketplaceConfigFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/marketplaceConfig/editMarketplaceConfig.form.validator";
import MarketplaceConfig from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";
import {marketplaceConfigService} from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig.service";
import {MarketplaceConfigActions} from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig.actions";
import {marketplaceConfigToDTO, marketplaceConfigsToDTO} from "@marketplaceModule/utilities/mappers/marketplaceConfig/marketplaceConfigMapper.dto";
import {marketplaceConfigsToSelect} from "@marketplaceModule/utilities/mappers/marketplaceConfig/marketplaceConfigMapper.select";

export const basePath = "/api/marketplace/marketplaceConfig";

// One settings document per company (unique index); the settings page creates it through `ensure`.
export const {router} = createCrudRouter({
    collectionName: "marketplaceconfigs",
    model: MarketplaceConfig,
    service: marketplaceConfigService,
    entityName: "MarketplaceConfig",
    createSchema: createMarketplaceConfigFormSchema,
    editSchema: editMarketplaceConfigFormSchema,
    toDTO: marketplaceConfigToDTO,
    toDTOArray: marketplaceConfigsToDTO,
    toSelect: marketplaceConfigsToSelect,
    selectSearchField: "_id",
    actions: MarketplaceConfigActions,
    buildCreateData: buildCreateDataFromSchemaDef(MarketplaceConfigSchemaDef),
    buildUpdateData: buildUpdateDataFromSchemaDef(MarketplaceConfigSchemaDef),
    rateLimits: {read: 60, write: 30, delete: 0},
});
