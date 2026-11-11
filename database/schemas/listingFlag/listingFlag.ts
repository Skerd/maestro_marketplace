import { Document, model, Schema, SchemaTypes } from "mongoose";
import { IListing } from "@marketplaceModule/database/schemas/listing/listing";
import { IUser } from "@coreModule/database/schemas/user/user";
import { ICompany } from "@coreModule/database/schemas/company/company";
import { normalizeSchemaPermissions } from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import {
    IOwnershipPluginFields,
    ILifeCyclePluginFields,
    ISoftDeletePluginFields
} from "@coreModule/database/types/plugin-fields";
import { addModelData } from "@coreModule/database/collections";
import { validateSchemaDefAgainstMongoose } from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import { ListingFlagSchemaDef } from "armonia/src/modules/marketplace/api/marketplace/private/listingFlag/listingFlag.schema-def";
import { SimpleUserSnippet } from "@coreModule/database/schemas/user/user.snippets";
import { ListingSimpleSnippet } from "@marketplaceModule/database/schemas/listing/listing.snippets";
import { applyListingFlagIndexes } from "./listingFlag.indexes";
import { listingFlagViews } from "./listingFlag.views";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";

import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";

export type ListingFlagReason = "inappropriate" | "spam" | "misleading" | "other";

export interface IListingFlag extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    listing: IListing;
    user: IUser;
    company: ICompany;
    reason: ListingFlagReason;
    comment?: string;
    status: "pending" | "reviewed" | "dismissed";
    resolution?: string;
}

const ListingFlagSchema = new Schema<IListingFlag>(
    {
        listing: {
            type: SchemaTypes.ObjectId,
            ref: "Listing",
            required: true,
            refAllowlist: ListingSimpleSnippet,
            permissions: { self: { publicRead: true } },
        },
        user: {
            type: SchemaTypes.ObjectId,
            ref: "User",
            required: true,
            refAllowlist: SimpleUserSnippet,
            permissions: { self: { publicRead: true } },
        },
        reason: {
            type: SchemaTypes.String,
            enum: ["inappropriate", "spam", "misleading", "other"],
            required: true,
            permissions: { self: { publicRead: true } },
        },
        comment: {
            type: SchemaTypes.String,
            trim: true,
            permissions: { self: { publicRead: true } },
            dynamicTableConfiguration: { hideColumn: true },
        },
        status: {
            type: SchemaTypes.String,
            enum: ["pending", "reviewed", "dismissed"],
            default: "pending",
            permissions: { self: { publicRead: true } },
            dynamicTableConfiguration: {
                enumTones: {
                    pending:     "warning",
                    reviewed:    "success",
                    dismissed:   "neutral",
                },
            },
        },
        resolution: {
            type: SchemaTypes.String,
            trim: true,
            permissions: { self: { publicRead: true } },
            dynamicTableConfiguration: { hideColumn: true },
        },
    },
    {
        accessMode: "loose",
    }
);

ownershipPlugin(ListingFlagSchema);
softDeletePlugin(ListingFlagSchema);
auditPlugin(ListingFlagSchema);
lifeCyclePlugin(ListingFlagSchema);
applyListingFlagIndexes(ListingFlagSchema);
const ListingFlag = model<IListingFlag>("ListingFlag", ListingFlagSchema);
normalizeSchemaPermissions(ListingFlag);
export default ListingFlag;

addModelData(ListingFlag, listingFlagViews);
validateSchemaDefAgainstMongoose(ListingFlagSchema, ListingFlagSchemaDef, "ListingFlag", ["user", "status", "resolution"]);
