import { Document, model, Schema, SchemaTypes } from "mongoose";
import { IListing } from "@marketplaceModule/database/schemas/listing/listing";
import { ICurrency } from "@coreModule/database/schemas/currency/currency";
import { IUser } from "@coreModule/database/schemas/user/user";
import { normalizeSchemaPermissions } from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import {IOwnershipPluginFields, ILifeCyclePluginFields, ISoftDeletePluginFields} from "@coreModule/database/types/plugin-fields";
import { ICompany } from "@coreModule/database/schemas/company/company";
import { addModelData } from "@coreModule/database/collections";
import { validateSchemaDefAgainstMongoose } from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import { ListingAddOnSchemaDef } from "armonia/src/modules/marketplace/api/marketplace/private/listingAddOn/listingAddOn.schema-def";
import { CurrencySimpleSnippet } from "@coreModule/database/schemas/currency/currency.snippets";
import { SimpleUserSnippet } from "@coreModule/database/schemas/user/user.snippets";
import { ListingSimpleSnippet } from "@marketplaceModule/database/schemas/listing/listing.snippets";
import { applyListingAddOnIndexes } from "./listingAddOn.indexes";
import { listingAddOnViews } from "./listingAddOn.views";

export interface IListingAddOn extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    company: ICompany;
    listing: IListing;
    provider: IUser;
    name: string;
    price: {
        amount: number;
        currency: ICurrency;
    };
    deliveryDays?: number;
}

const ListingAddOnSchema = new Schema<IListingAddOn>(
    {
        listing: {
            type: SchemaTypes.ObjectId,
            ref: "Listing",
            required: true,
            refAllowlist: ListingSimpleSnippet,
            permissions: {
                self: {write: "no-permission"},
                others: {write: "no-permission"},
            },
        },
        provider: {
            type: SchemaTypes.ObjectId,
            ref: "User",
            required: true,
            refAllowlist: SimpleUserSnippet,
            permissions: {
                self: {write: "no-permission"},
                others: {write: "no-permission"},
            },
            // Always the listing's provider, so the column only repeats it (UX-12).
            dynamicTableConfiguration: {hideColumn: true},
        },
        name: {
            type: SchemaTypes.String,
            required: true,
            trim: true,
        },
        price: {
            type: {
                amount: {
                    type: SchemaTypes.Number,
                    required: true,
                    default: 0,
                },
                currency: {
                    type: SchemaTypes.ObjectId,
                    ref: "Currency",
                    required: true,
                    refAllowlist: CurrencySimpleSnippet,
                },
            }
        },
        deliveryDays: {
            type: SchemaTypes.Number,
        },
    },
    {
        accessMode: "loose",
    }
);

ownershipPlugin(ListingAddOnSchema);
auditPlugin(ListingAddOnSchema);
softDeletePlugin(ListingAddOnSchema);
lifeCyclePlugin(ListingAddOnSchema);
applyListingAddOnIndexes(ListingAddOnSchema);
const ListingAddOn = model<IListingAddOn>("ListingAddOn", ListingAddOnSchema);
normalizeSchemaPermissions(ListingAddOn);
export default ListingAddOn;

addModelData(ListingAddOn, listingAddOnViews);
validateSchemaDefAgainstMongoose(ListingAddOnSchema, ListingAddOnSchemaDef, "ListingAddOn", ["provider"]);
