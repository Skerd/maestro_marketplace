import { Document, model, Schema, SchemaTypes } from "mongoose";
import { IOrder } from "@marketplaceModule/database/schemas/order/order";
import { IOrderDelivery } from "@marketplaceModule/database/schemas/orderDelivery/orderDelivery";
import { IUser } from "@coreModule/database/schemas/user/user";
import { ICompany } from "@coreModule/database/schemas/company/company";
import { addModelData } from "@coreModule/database/collections";
import { SimpleUserSnippet } from "@coreModule/database/schemas/user/user.snippets";
import { OrderSimpleSnippet } from "@marketplaceModule/database/schemas/order/order.snippets";
import { OrderDeliverySimpleSnippet } from "@marketplaceModule/database/schemas/orderDelivery/orderDelivery.snippets";
import { normalizeSchemaPermissions } from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import {IOwnershipPluginFields, ILifeCyclePluginFields, ISoftDeletePluginFields} from "@coreModule/database/types/plugin-fields";
import { applyOrderRevisionIndexes } from "./orderRevision.indexes";
import { orderRevisionViews } from "./orderRevision.views";
import {validateSchemaDefAgainstMongoose} from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import {OrderRevisionSchemaDef} from "armonia/src/modules/marketplace/api/marketplace/private/orderRevision/orderRevision.schema-def";

export type OrderRevisionStatus = "pending" | "completed";

export interface IOrderRevision extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    company: ICompany;
    order: IOrder;
    delivery: IOrderDelivery;
    requestedBy: IUser;
    reason: string;
    status: OrderRevisionStatus;
}

const OrderRevisionSchema = new Schema<IOrderRevision>(
    {
        order: {
            type: SchemaTypes.ObjectId,
            ref: "Order",
            required: true,
            refAllowlist: OrderSimpleSnippet,
        },
        delivery: {
            type: SchemaTypes.ObjectId,
            ref: "OrderDelivery",
            required: true,
            refAllowlist: OrderDeliverySimpleSnippet,
            dynamicTableConfiguration: {hideColumn: true},
        },
        requestedBy: {
            type: SchemaTypes.ObjectId,
            ref: "User",
            required: true,
            refAllowlist: SimpleUserSnippet,
        },
        reason: {
            type: SchemaTypes.String,
            required: true,
            default: "",
        },
        status: {
            type: SchemaTypes.String,
            enum: ["pending", "completed"],
            default: "pending",
            dynamicTableConfiguration: {
                enumTones: {
                    pending:     "warning",
                    completed:   "success",
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

ownershipPlugin(OrderRevisionSchema);
auditPlugin(OrderRevisionSchema);
softDeletePlugin(OrderRevisionSchema);
lifeCyclePlugin(OrderRevisionSchema);
applyOrderRevisionIndexes(OrderRevisionSchema);
validateSchemaDefAgainstMongoose(OrderRevisionSchema, OrderRevisionSchemaDef, "OrderRevision", [
    "requestedBy",
    "status",
]);
const OrderRevision = model<IOrderRevision>("OrderRevision", OrderRevisionSchema);
normalizeSchemaPermissions(OrderRevision);
export default OrderRevision;

addModelData(OrderRevision, orderRevisionViews);
