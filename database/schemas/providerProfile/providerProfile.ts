import { Document, model, Schema, SchemaTypes } from "mongoose";
import { IUser } from "@coreModule/database/schemas/user/user";
import { ICompany } from "@coreModule/database/schemas/company/company";
import { IMedia } from "@coreModule/database/schemas/media/media";
import { normalizeSchemaPermissions } from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import publicMediaPlugin from "@coreModule/database/plugins/publicMediaPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import {IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields} from "@coreModule/database/types/plugin-fields";
import { addModelData } from "@coreModule/database/collections";
import { validateSchemaDefAgainstMongoose } from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import { PROVIDER_PROFILE_TIMEZONE_MAX, ProviderProfileSchemaDef } from "armonia/src/modules/marketplace/api/marketplace/private/providerProfile/providerProfile.schema-def";
import type { WeeklyHoursSlot } from "armonia/src/modules/core/helpers/weeklyHours.schema-def";
import { MediaSimpleSnippet } from "@coreModule/database/schemas/media/media.snippets";
import { SimpleUserSnippet } from "@coreModule/database/schemas/user/user.snippets";
import { applyProviderProfileIndexes } from "./providerProfile.indexes";
import { providerProfileViews } from "./providerProfile.views";

export type IProviderAvailabilitySlot = WeeklyHoursSlot;

export interface IProviderProfile extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    user: IUser;
    company: ICompany;
    skills?: string[];
    bio?: string;
    portfolio?: IMedia[];
    /** Weekly windows a booking must fall inside (D105), in `timezone`; empty means no restriction. */
    availability?: IProviderAvailabilitySlot[];
    /** IANA zone of `availability`; unset means the company's zone (`companyTimeZone`, D91). */
    timezone?: string;
    /** Stripe Connect Express account (payouts destination). System-managed via providerProfile actions. */
    stripeAccountId?: string;
    stripeChargesEnabled?: boolean;
    stripePayoutsEnabled?: boolean;
    stripeDetailsSubmitted?: boolean;
    stripeAccountSyncedAt?: Date;
}

const ProviderProfileSchema = new Schema<IProviderProfile>(
    {
        user: {
            type: SchemaTypes.ObjectId,
            ref: "User",
            required: true,
            refAllowlist: SimpleUserSnippet,
        },
        skills: {
            type: [SchemaTypes.String],
            default: [],
        },
        bio: {
            type: SchemaTypes.String,
            default: "",
            trim: true,
            dynamicTableConfiguration: {hideColumn: true},
        },
        portfolio: {
            type: [
                {
                    type: SchemaTypes.ObjectId,
                    ref: "Media",
                    refAllowlist: MediaSimpleSnippet,
                },
            ],
            default: [],
        },
        // `as any` below: Mongoose 6 typings reject `_id: false` on an inline array item
        availability: {
            type: [
                {
                    dayOfWeek: {
                        type: SchemaTypes.Number,
                        required: true,
                        min: 0,
                        max: 6,
                    },
                    startTime: {
                        type: SchemaTypes.String,
                        required: true,
                        trim: true,
                    },
                    endTime: {
                        type: SchemaTypes.String,
                        required: true,
                        trim: true,
                    },
                    _id: false,
                },
            ],
            default: [],
            dynamicTableConfiguration: {hideColumn: true},
        } as any,
        timezone: {
            type: SchemaTypes.String,
            trim: true,
            maxlength: PROVIDER_PROFILE_TIMEZONE_MAX,
            dynamicTableConfiguration: {hideColumn: true},
        },
        // Stripe ids and sync flags are technical; payouts-enabled is the one state worth a column (UX-12).
        stripeAccountId: {type: SchemaTypes.String, trim: true, permissions: {self: {write: "no-permission"}, others: {write: "no-permission"}}, dynamicTableConfiguration: {hideColumn: true}},
        stripeChargesEnabled: {type: SchemaTypes.Boolean, default: false, permissions: {self: {write: "no-permission"}, others: {write: "no-permission"}}, dynamicTableConfiguration: {hideColumn: true}},
        stripePayoutsEnabled: {type: SchemaTypes.Boolean, default: false, permissions: {self: {write: "no-permission"}, others: {write: "no-permission"}}},
        stripeDetailsSubmitted: {type: SchemaTypes.Boolean, default: false, permissions: {self: {write: "no-permission"}, others: {write: "no-permission"}}, dynamicTableConfiguration: {hideColumn: true}},
        stripeAccountSyncedAt: {type: SchemaTypes.Date, permissions: {self: {write: "no-permission"}, others: {write: "no-permission"}}, dynamicTableConfiguration: {hideColumn: true}},
    },
    {
        accessMode: "loose",
    }
);

ownershipPlugin(ProviderProfileSchema);
publicMediaPlugin(ProviderProfileSchema, {schemaDef: ProviderProfileSchemaDef});
auditPlugin(ProviderProfileSchema);
softDeletePlugin(ProviderProfileSchema);
lifeCyclePlugin(ProviderProfileSchema);
applyProviderProfileIndexes(ProviderProfileSchema);
const ProviderProfile = model<IProviderProfile>("ProviderProfile", ProviderProfileSchema);
normalizeSchemaPermissions(ProviderProfile);
export default ProviderProfile;

addModelData(ProviderProfile, providerProfileViews);
validateSchemaDefAgainstMongoose(ProviderProfileSchema, ProviderProfileSchemaDef, "ProviderProfile", [
    "user",
    // Stripe Connect fields are system-managed (actions + webhooks), never form-writable
    "stripeAccountId", "stripeChargesEnabled", "stripePayoutsEnabled", "stripeDetailsSubmitted", "stripeAccountSyncedAt",
]);
