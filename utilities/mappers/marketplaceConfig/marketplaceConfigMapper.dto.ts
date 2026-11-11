import type {IMarketplaceConfig} from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";
import type {MarketplaceConfig} from "armonia/src/modules/marketplace/api/marketplace/private/marketplaceConfig/marketplaceConfig.dto";
import type {CurrencySimple} from "armonia/src/modules/core/dto/currency.dto";
import {mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {mapLifeCycleToDTO, mapOwnershipToDTO, mapSoftDeleteToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";

export function marketplaceConfigToDTO(config: IMarketplaceConfig): MarketplaceConfig {
    return {
        _id: config._id.toString(),
        listedOnPortal: config.listedOnPortal,
        currency: mapSnippet<CurrencySimple>()(config.currency, CurrencySimpleSnippet),
        ...mapSoftDeleteToDTO(config),
        ...mapOwnershipToDTO(config),
        ...mapLifeCycleToDTO(config),
    };
}

export function marketplaceConfigsToDTO(configs: IMarketplaceConfig[]): MarketplaceConfig[] {
    return configs.map(marketplaceConfigToDTO);
}
