import {Document, model, Schema, SchemaTypes} from "mongoose";
import {IUser} from "@coreModule/database/schemas/user/user";
import type {ICompany} from "@coreModule/database/schemas/company/company";
import {ICurrency} from "@coreModule/database/schemas/currency/currency";
import {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import {normalizeSchemaPermissions} from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import {IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields} from "@coreModule/database/types/plugin-fields";
import {addModelData} from "@coreModule/database/collections";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {SimpleUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {TaskRequestSimpleSnippet} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.snippets";
import {validateSchemaDefAgainstMongoose} from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import {BidSchemaDef} from "armonia/src/modules/marketplace/api/marketplace/private/bid/bid.schema-def";
import {applyBidIndexes} from "./bid.indexes";
import {bidViews} from "./bid.views";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import dayjs from "dayjs";
import crypto from "crypto";

export type BidStatus = "pending" | "accepted" | "rejected";

export interface IBid extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    name: string;
    taskRequest: ITaskRequest;
    bidder: IUser;
    /** The bidder's company when it is not the job's: a quote from a lead on a portal job (D143). */
    bidderCompany?: ICompany;
    amount: number;
    currency: ICurrency;
    proposal: string;
    deliveryDays: number;
    status: BidStatus;
}

const BidSchema = new Schema<IBid>(
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
        taskRequest: {
            type: SchemaTypes.ObjectId,
            ref: "TaskRequest",
            required: true,
            refAllowlist: TaskRequestSimpleSnippet,
        },
        bidderCompany: {
            type: SchemaTypes.ObjectId,
            ref: "Company",
            permissions: {self: {write: "no-permission"}, others: {write: "no-permission"}},
            dynamicTableConfiguration: {hideColumn: true},
        },
        bidder: {
            type: SchemaTypes.ObjectId,
            ref: "User",
            required: true,
            refAllowlist: SimpleUserSnippet,
        },
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
            dynamicTableConfiguration: {hideColumn: true},
        },
        proposal: {
            type: SchemaTypes.String,
            required: true,
            default: "",
            dynamicTableConfiguration: {hideColumn: true},
        },
        deliveryDays: {
            type: SchemaTypes.Number,
            required: true,
            default: 1,
        },
        status: {
            type: SchemaTypes.String,
            enum: ["pending", "accepted", "rejected"],
            default: "pending",
            dynamicTableConfiguration: {
                enumTones: {
                    pending:    "warning",
                    accepted:   "success",
                    rejected:   "danger",
                },
            },
        },
    },
    {
        accessMode: "loose",
    },
);

BidSchema.pre("save", function (next) {
    const bid = this as IBid;
    if (bid.isNew && !bid.name) {
        const datePart = dayjs(new Date()).format("YYYYMMDD");
        const randomPart = crypto.randomBytes(4).toString("hex");
        bid.name = `BID-${datePart}-${randomPart}`.toUpperCase();
    }
    next();
});

ownershipPlugin(BidSchema);
softDeletePlugin(BidSchema);
auditPlugin(BidSchema);
lifeCyclePlugin(BidSchema);
applyBidIndexes(BidSchema);
/** Distinct from propertyManagement `Bid` (tender bids) — shared mongoose name would overwrite. */
const Bid = model<IBid>("MarketplaceBid", BidSchema, "marketplacebids");
normalizeSchemaPermissions(Bid);
export default Bid;

addModelData(Bid, bidViews);
validateSchemaDefAgainstMongoose(BidSchema, BidSchemaDef, "MarketplaceBid", ["status", "currency", "bidder", "bidderCompany"]);
