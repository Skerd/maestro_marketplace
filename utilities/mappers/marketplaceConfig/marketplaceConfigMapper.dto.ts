import type {IMarketplaceConfig} from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";
import type {MarketplaceConfig} from "armonia/src/modules/marketplace/api/marketplace/private/marketplaceConfig/marketplaceConfig.dto";
import type {CurrencySimple} from "armonia/src/modules/core/dto/currency.dto";
import {mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import type {ListingCategorySimple} from "armonia/src/modules/marketplace/dto/listingCategory.dto";
import {listingCategorySimpleToDTO} from "@marketplaceModule/utilities/mappers/listingCategory/listingCategoryMapper.dto";
import {mapLifeCycleToDTO, mapOwnershipToDTO, mapSoftDeleteToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";

export function marketplaceConfigToDTO(config: IMarketplaceConfig): MarketplaceConfig {
    return {
        _id: config._id.toString(),
        listedOnPortal: config.listedOnPortal,
        currency: mapSnippet<CurrencySimple>()(config.currency, CurrencySimpleSnippet),
        branches: (config.branches ?? []).map((branch) => listingCategorySimpleToDTO(branch)).filter((branch): branch is ListingCategorySimple => !!branch),
        ...(config.leadCap != null ? {leadCap: config.leadCap} : {}),
        ...(config.openJobLimit != null ? {openJobLimit: config.openJobLimit} : {}),
        ...mapSoftDeleteToDTO(config),
        ...mapOwnershipToDTO(config),
        ...mapLifeCycleToDTO(config),
    };
}

export function marketplaceConfigsToDTO(configs: IMarketplaceConfig[]): MarketplaceConfig[] {
    return configs.map(marketplaceConfigToDTO);
}
