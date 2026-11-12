import {Document, model, Schema, SchemaTypes} from "mongoose";
import {IUser} from"@coreModule/database/schemas/user/user";
import {ICompany} from"@coreModule/database/schemas/company/company";
import {ICurrency} from"@coreModule/database/schemas/currency/currency";
import {IListing} from"@marketplaceModule/database/schemas/listing/listing";
import {ITaskRequest} from"@marketplaceModule/database/schemas/taskRequest/taskRequest";
import {IBid} from"@marketplaceModule/database/schemas/bid/bid";
import {normalizeSchemaPermissions} from"@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import {IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields} from "@coreModule/database/types/plugin-fields";
import {addModelData} from"@coreModule/database/collections";
import {CurrencySimpleSnippet} from"@coreModule/database/schemas/currency/currency.snippets";
import {SimpleUserSnippet} from"@coreModule/database/schemas/user/user.snippets";
import {BidSimpleSnippet} from"@marketplaceModule/database/schemas/bid/bid.snippets";
import {ListingSimpleSnippet} from"@marketplaceModule/database/schemas/listing/listing.snippets";
import {TaskRequestSimpleSnippet} from"@marketplaceModule/database/schemas/taskRequest/taskRequest.snippets";
import {validateSchemaDefAgainstMongoose} from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import {ORDER_NOTE_MAX, OrderSchemaDef} from "armonia/src/modules/marketplace/api/marketplace/private/order/order.schema-def";
import {applyOrderIndexes} from "./order.indexes";
import {orderViews} from "./order.views";
import dayjs from "dayjs";
import crypto from "crypto";

export type OrderStatus = "pending" | "accepted" | "in_progress" | "completed" | "cancelled";

export interface IOrder extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    name: string;
    listing?: IListing;
    taskRequest?: ITaskRequest;
    bid?: IBid;
    customer: IUser;
    provider: IUser;
    amount: number;
    currency: ICurrency;
    status: OrderStatus;
    company: ICompany;
    deliveryDueDate?: Date;
    note?: string;
}

const OrderSchema = new Schema<IOrder>(
    {
        name: {
            type: SchemaTypes.String,
            trim: true,
            immutable: true,
            permissions: {
                self: {write: "no-permission"},
                others: {write: "no-permission"},
            },
            dynamicTableConfiguration: {hideColumn: true},
        },
        listing: {
            type: SchemaTypes.ObjectId,
            ref: "Listing",
            refAllowlist: ListingSimpleSnippet,
        },
        taskRequest: {
            type: SchemaTypes.ObjectId,
            ref: "TaskRequest",
            refAllowlist: TaskRequestSimpleSnippet,
        },
        bid: {
            type: SchemaTypes.ObjectId,
            ref: "MarketplaceBid",
            refAllowlist: BidSimpleSnippet,
        },
        customer: {
            type: SchemaTypes.ObjectId,
            ref: "User",
            required: true,
            refAllowlist: SimpleUserSnippet,
        },
        provider: {
            type: SchemaTypes.ObjectId,
            ref: "User",
            required: true,
            refAllowlist: SimpleUserSnippet,
        },
        amount: {
            type: SchemaTypes.Number,
            required: true,
            default: 0,
            dynamicTableConfiguration: {currencyPath: "currency"},
        },
        currency: {
            type: SchemaTypes.ObjectId,
            ref: "Currency",
            required: true,
            refAllowlist: CurrencySimpleSnippet,
            dynamicTableConfiguration: {hideColumn: true},
        },
        status: {
            type: SchemaTypes.String,
            enum: ["pending", "accepted", "in_progress", "completed", "cancelled"],
            default: "pending",
            permissions: {
                self: {write: "no-permission"},
                others: {write: "no-permission"},
            },
            dynamicTableConfiguration: {
                enumTones: {
                    pending:       "warning",
                    accepted:      "success",
                    in_progress:   "warning",
                    completed:     "success",
                    cancelled:     "danger",
                },
            },
        },
        deliveryDueDate: {
            type: SchemaTypes.Date,
            permissions: {
                self: {write: "no-permission"},
                others: {write: "no-permission"},
            },
        },
        note: {
            type: SchemaTypes.String,
            trim: true,
            maxlength: ORDER_NOTE_MAX,
            permissions: {
                self: {write: "no-permission"},
                others: {write: "no-permission"},
            },
            dynamicTableConfiguration: {hideColumn: true},
        },
    },
    {
        accessMode: "loose",
        // Orders are created only by OrderActions.createFromListing and BidActions.accept
        permissions: {
            self: {create: "no-permission"},
            others: {create: "no-permission"},
        },
    }
);

OrderSchema.pre("save", function (next) {
    const order = this as IOrder;
    if (order.isNew && !order.name) {
        const datePart = dayjs(new Date()).format("YYYYMMDD");
        const randomPart = crypto.randomBytes(4).toString("hex");
        order.name = `ORDER-${datePart}-${randomPart}`.toUpperCase();
    }
    next();
});

ownershipPlugin(OrderSchema);
auditPlugin(OrderSchema);
softDeletePlugin(OrderSchema);
lifeCyclePlugin(OrderSchema);
applyOrderIndexes(OrderSchema);
const Order = model<IOrder>("Order", OrderSchema);
normalizeSchemaPermissions(Order);
export default Order;

addModelData(Order, orderViews);
validateSchemaDefAgainstMongoose(OrderSchema, OrderSchemaDef, "Order", ["status", "deliveryDueDate"]);
