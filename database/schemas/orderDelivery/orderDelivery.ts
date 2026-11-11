import { Document, model, Schema, SchemaTypes } from "mongoose";
import { IOrder } from "@marketplaceModule/database/schemas/order/order";
import { IMedia } from "@coreModule/database/schemas/media/media";
import { ICompany } from "@coreModule/database/schemas/company/company";
import { addModelData } from "@coreModule/database/collections";
import { MediaSimpleSnippet } from "@coreModule/database/schemas/media/media.snippets";
import { OrderSimpleSnippet } from "@marketplaceModule/database/schemas/order/order.snippets";
import { normalizeSchemaPermissions } from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import {IOwnershipPluginFields, ILifeCyclePluginFields, ISoftDeletePluginFields} from "@coreModule/database/types/plugin-fields";
import { applyOrderDeliveryIndexes } from "./orderDelivery.indexes";
import { orderDeliveryViews } from "./orderDelivery.views";
import {validateSchemaDefAgainstMongoose} from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import {OrderDeliverySchemaDef} from "armonia/src/modules/marketplace/api/marketplace/private/orderDelivery/orderDelivery.schema-def";

export type OrderDeliveryStatus = "submitted" | "accepted" | "revision_requested";

export interface IOrderDelivery extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    company: ICompany;
    order: IOrder;
    message?: string;
    attachments: IMedia[];
    status: OrderDeliveryStatus;
}

const OrderDeliverySchema = new Schema<IOrderDelivery>(
    {
        order: {
            type: SchemaTypes.ObjectId,
            ref: "Order",
            required: true,
            refAllowlist: OrderSimpleSnippet,
        },
        message: {
            type: SchemaTypes.String,
            default: "",
            dynamicTableConfiguration: {hideColumn: true},
        },
        attachments: {
            type: [
                {
                    type: SchemaTypes.ObjectId,
                    ref: "Media",
                    refAllowlist: MediaSimpleSnippet,
                },
            ],
            dynamicTableConfiguration: {hideColumn: true},
        },
        status: {
            type: SchemaTypes.String,
            enum: ["submitted", "accepted", "revision_requested"],
            default: "submitted",
            dynamicTableConfiguration: {
                enumTones: {
                    submitted:            "info",
                    accepted:             "success",
                    revision_requested:   "warning",
                },
            },
        },
    },
    {
        accessMode: "loose",
        // Written only by OrderActions; the CRUD router is read-only
        permissions: {
            self: {create: "no-permission", delete: "no-permission", restore: "no-permission"},
            others: {create: "no-permission", delete: "no-permission", restore: "no-permission"},
        },
    }
);

ownershipPlugin(OrderDeliverySchema);
auditPlugin(OrderDeliverySchema);
softDeletePlugin(OrderDeliverySchema);
lifeCyclePlugin(OrderDeliverySchema);
applyOrderDeliveryIndexes(OrderDeliverySchema);
validateSchemaDefAgainstMongoose(OrderDeliverySchema, OrderDeliverySchemaDef, "OrderDelivery", ["status"]);
const OrderDelivery = model<IOrderDelivery>("OrderDelivery", OrderDeliverySchema);
normalizeSchemaPermissions(OrderDelivery);
export default OrderDelivery;

addModelData(OrderDelivery, orderDeliveryViews);
