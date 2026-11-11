import {Document, model, Schema, SchemaTypes} from "mongoose";
import {ICurrency} from "@coreModule/database/schemas/currency/currency";
import {normalizeSchemaPermissions} from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import {ILifeCyclePluginFields, IOwnershipPluginFields, ISoftDeletePluginFields} from "@coreModule/database/types/plugin-fields";
import {addModelData} from "@coreModule/database/collections";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {validateSchemaDefAgainstMongoose} from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import {MarketplaceConfigSchemaDef} from "armonia/src/modules/marketplace/api/marketplace/private/marketplaceConfig/marketplaceConfig.schema-def";
import {applyMarketplaceConfigIndexes} from "./marketplaceConfig.indexes";
import {marketplaceConfigViews} from "./marketplaceConfig.views";

export interface IMarketplaceConfig extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    /** The company opts in to being listed on the central portal's services section. */
    listedOnPortal: boolean;
    /** The currency a listing, package or add-on priced without one is in. */
    currency: ICurrency;
}

const MarketplaceConfigSchema = new Schema<IMarketplaceConfig>(
    {
        listedOnPortal: {type: SchemaTypes.Boolean, default: false},
        currency: {
            type: SchemaTypes.ObjectId,
            ref: "Currency",
            required: true,
            refAllowlist: CurrencySimpleSnippet,
            dynamicTableConfiguration: {refDisplayKey: ["abbreviation"]},
        },
    },
    {accessMode: "loose"},
);
ownershipPlugin(MarketplaceConfigSchema);
auditPlugin(MarketplaceConfigSchema);
softDeletePlugin(MarketplaceConfigSchema);
lifeCyclePlugin(MarketplaceConfigSchema);
applyMarketplaceConfigIndexes(MarketplaceConfigSchema);
const MarketplaceConfig = model<IMarketplaceConfig>("MarketplaceConfig", MarketplaceConfigSchema);
normalizeSchemaPermissions(MarketplaceConfig);
export default MarketplaceConfig;
addModelData(MarketplaceConfig, marketplaceConfigViews);
validateSchemaDefAgainstMongoose(MarketplaceConfigSchema, MarketplaceConfigSchemaDef, "MarketplaceConfig");
