import * as crypto from "crypto";
import dayjs from "dayjs";
import { Document, model, Schema, SchemaTypes } from "mongoose";
import { IListing } from "@marketplaceModule/database/schemas/listing/listing";
import { ICompany } from "@coreModule/database/schemas/company/company";
import { normalizeSchemaPermissions } from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import {IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields} from "@coreModule/database/types/plugin-fields";
import { addModelData } from "@coreModule/database/collections";
import { COLUMN_TYPE } from "armonia/src/modules/core/database/filter/typeOperators";
import { ListingSimpleSnippet } from "@marketplaceModule/database/schemas/listing/listing.snippets";
import {validateSchemaDefAgainstMongoose} from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import {PromotionSchemaDef} from "armonia/src/modules/marketplace/api/marketplace/private/promotion/promotion.schema-def";
import { applyPromotionIndexes } from "./promotion.indexes";
import { promotionViews } from "./promotion.views";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";

import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";

export type PromotionType = "featured" | "sponsored";

export type PromotionLifecycleStatus = "active" | "paused" | "stopped";

export interface IPromotion extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    name: string;
    listing: IListing;
    company: ICompany;
    type: PromotionType;
    lifecycleStatus: PromotionLifecycleStatus;
    stopReason?: string;
    startAt: Date;
    endAt: Date;
}

const PromotionSchema = new Schema<IPromotion>(
    {
        name: {
            type: SchemaTypes.String,
            trim: true,
            immutable: true,
            permissions: {
                self: {write: "no-permission"},
                others: {write: "no-permission"},
            },
        },
        listing: {
            type: SchemaTypes.ObjectId,
            ref: "Listing",
            required: true,
            refAllowlist: ListingSimpleSnippet,
        },
        type: {
            type: SchemaTypes.String,
            enum: ["featured", "sponsored"],
            default: "featured",
        },
        lifecycleStatus: {
            type: SchemaTypes.String,
            enum: ["active", "paused", "stopped"],
            default: "active",
            required: true,
            dynamicTableConfiguration: {
                enumTones: {
                    active:    "success",
                    paused:    "warning",
                    stopped:   "danger",
                },
            },
        },
        stopReason: {
            type: SchemaTypes.String,
            trim: true,
            maxlength: 2000,
            dynamicTableConfiguration: {hideColumn: true},
        },
        startAt: {
            type: SchemaTypes.Date,
            required: true,
            dynamicTableConfiguration: {cellType: COLUMN_TYPE.DATETIME},
        },
        endAt: {
            type: SchemaTypes.Date,
            required: true,
            dynamicTableConfiguration: {cellType: COLUMN_TYPE.DATETIME},
        },
    },
    {
        accessMode: "loose",
    }
);

PromotionSchema.pre("save", function (next) {
    const promotion = this as IPromotion;
    if (promotion.isNew && !promotion.name) {
        const datePart = dayjs(promotion.startAt || new Date()).format("YYYYMMDD");
        const randomPart = crypto.randomBytes(4).toString("hex");
        promotion.name = `PROMO-${datePart}-${randomPart}`.toUpperCase();
    }
    next();
});

ownershipPlugin(PromotionSchema);
auditPlugin(PromotionSchema);
softDeletePlugin(PromotionSchema);
lifeCyclePlugin(PromotionSchema);
applyPromotionIndexes(PromotionSchema);
const Promotion = model<IPromotion>("Promotion", PromotionSchema);
normalizeSchemaPermissions(Promotion);
export default Promotion;

addModelData(Promotion, promotionViews);
validateSchemaDefAgainstMongoose(PromotionSchema, PromotionSchemaDef, "Promotion", ["name", "lifecycleStatus", "stopReason"]);
