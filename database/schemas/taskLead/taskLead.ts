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
import {TaskRequestSimpleSnippet} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.snippets";
import {applyTaskLeadIndexes} from "./taskLead.indexes";

export const taskLeadStatuses = ["new", "viewed", "quoted", "declined", "won", "lost", "expired"] as const;
export type TaskLeadStatus = (typeof taskLeadStatuses)[number];

/**
 * A portal job (in the marketplace operator) that matched one of this company's providers (D143). It lives in the
 * provider's company, so its panel, permissions and notifications stay per company; only `taskRequest` points across.
 */
export interface ITaskLead extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    name: string;
    taskRequest: ITaskRequest;
    provider: IUser;
    /** The provider's listing that matched best (closest, then highest rated). */
    listing: IListing;
    /** Distance from the job's pin to that listing's pin; absent for online work. */
    distanceKm?: number;
    status: TaskLeadStatus;
}

const serverOnly = {self: {write: "no-permission"}, others: {write: "no-permission"}} as const;

const TaskLeadSchema = new Schema<ITaskLead>(
    {
        name: {type: SchemaTypes.String, permissions: serverOnly},
        taskRequest: {
            type: SchemaTypes.ObjectId,
            ref: "TaskRequest",
            required: true,
            refAllowlist: TaskRequestSimpleSnippet,
            permissions: serverOnly,
        },
        provider: {
            type: SchemaTypes.ObjectId,
            ref: "User",
            required: true,
            refAllowlist: SimpleUserSnippet,
            permissions: serverOnly,
        },
        listing: {type: SchemaTypes.ObjectId, ref: "Listing", required: true, permissions: serverOnly},
        distanceKm: {type: SchemaTypes.Number, min: 0, permissions: serverOnly},
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
    {accessMode: "loose"},
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

// No form: leads are created by the job matching only, so there is no SchemaDef (DB-05); the panel page is P12.3.
addModelData(TaskLead);
