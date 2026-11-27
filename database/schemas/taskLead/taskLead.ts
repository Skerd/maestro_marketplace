import {Document, model, Schema, SchemaTypes} from "mongoose";
import dayjs from "dayjs";
import crypto from "crypto";
import {IUser} from "@coreModule/database/schemas/user/user";
import {normalizeSchemaPermissions} from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import {IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields} from "@coreModule/database/types/plugin-fields";
import {addModelData} from "@coreModule/database/collections";
import {SimpleUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import type {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import type {IListing} from "@marketplaceModule/database/schemas/listing/listing";
import type {IBid} from "@marketplaceModule/database/schemas/bid/bid";
import {taskLeadOrigins, type TaskLeadOrigin} from "armonia/src/modules/marketplace/api/marketplace/private/taskLead/taskLead.schema-def";
import {applyTaskLeadIndexes} from "./taskLead.indexes";
import {TaskLeadJobSnippet, TaskLeadQuoteSnippet} from "./taskLead.snippets";
import {taskLeadViews} from "./taskLead.views";

export const taskLeadStatuses = ["new", "viewed", "quoted", "declined", "won", "lost", "expired"] as const;
export type TaskLeadStatus = (typeof taskLeadStatuses)[number];

/**
 * A portal job (in the platform company) that matched one of this company's providers (D143). It lives in the
 * provider's company, so its panel, permissions and notifications stay per company; only `taskRequest` points across.
 */
export interface ITaskLead extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    name: string;
    taskRequest: ITaskRequest;
    provider: IUser;
    /** The provider's listing that matched best (closest, then highest rated); a board lead has none (D172). */
    listing?: IListing;
    /** Matched by the job matching, or opened by a quote from the task board (D172); only matched leads count to the cap. */
    origin: TaskLeadOrigin;
    /** Distance from the job's pin to that listing's pin; absent for online work. */
    distanceKm?: number;
    status: TaskLeadStatus;
    /** The quote the provider placed from this lead: a bid next to the job, in the platform company. */
    bid?: IBid;
}

const serverOnly = {self: {write: "no-permission"}, others: {write: "no-permission"}} as const;

const TaskLeadSchema = new Schema<ITaskLead>(
    {
        name: {type: SchemaTypes.String, permissions: serverOnly},
        // The allowlist is the redacted job (D143) and the panel's field access for `taskRequest.*`. A populate in the
        // provider's tenant reads the platform's job as empty; the lead routes read it themselves (`taskLeadsToViews`).
        taskRequest: {
            type: SchemaTypes.ObjectId,
            ref: "TaskRequest",
            required: true,
            refAllowlist: TaskLeadJobSnippet,
            permissions: serverOnly,
        },
        provider: {
            type: SchemaTypes.ObjectId,
            ref: "User",
            required: true,
            refAllowlist: SimpleUserSnippet,
            permissions: serverOnly,
        },
        listing: {type: SchemaTypes.ObjectId, ref: "Listing", permissions: serverOnly},
        origin: {
            type: SchemaTypes.String,
            enum: taskLeadOrigins,
            default: "matched",
            required: true,
            permissions: serverOnly,
            dynamicTableConfiguration: {filterable: true, enumTones: {matched: "info", board: "neutral"}},
        },
        distanceKm: {type: SchemaTypes.Number, min: 0, permissions: serverOnly},
        bid: {type: SchemaTypes.ObjectId, ref: "MarketplaceBid", refAllowlist: TaskLeadQuoteSnippet, permissions: serverOnly},
        status: {
            type: SchemaTypes.String,
            enum: taskLeadStatuses,
            default: "new",
            required: true,
            permissions: serverOnly,
            dynamicTableConfiguration: {
                enumTones: {new: "info", viewed: "neutral", quoted: "warning", declined: "neutral", won: "success", lost: "danger", expired: "neutral"},
            },
        },
    },
    {
        accessMode: "loose",
        // Created by the job matching or a quote from the task board, changed only by the lead's actions: the CRUD
        // router is read-only.
        permissions: {
            self: {create: "no-permission", delete: "no-permission", restore: "no-permission"},
            others: {create: "no-permission", delete: "no-permission", restore: "no-permission"},
        },
    },
);

TaskLeadSchema.pre("save", function (next) {
    const lead = this as ITaskLead;
    if (lead.isNew && !lead.name) {
        lead.name = `LEAD-${dayjs().format("YYYYMMDD")}-${crypto.randomBytes(4).toString("hex")}`.toUpperCase();
    }
    next();
});

ownershipPlugin(TaskLeadSchema);
softDeletePlugin(TaskLeadSchema);
auditPlugin(TaskLeadSchema);
lifeCyclePlugin(TaskLeadSchema);
applyTaskLeadIndexes(TaskLeadSchema);
const TaskLead = model<ITaskLead>("TaskLead", TaskLeadSchema, "taskleads");
normalizeSchemaPermissions(TaskLead);
export default TaskLead;

// No form: leads are created by the job matching and the task board's quote only, so there is no SchemaDef (DB-05).
addModelData(TaskLead, taskLeadViews);
