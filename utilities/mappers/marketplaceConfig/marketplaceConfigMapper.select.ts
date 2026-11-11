import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";
import type {IMarketplaceConfig} from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";

export function marketplaceConfigsToSelect(configs: IMarketplaceConfig[]): ApiSelectDatum[] {
    return configs.map((config) => ({value: config._id.toString(), label: config._id.toString()}));
}
