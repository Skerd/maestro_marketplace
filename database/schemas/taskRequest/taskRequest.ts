import { Document, model, Schema, SchemaTypes } from "mongoose";
import { IMedia } from "@coreModule/database/schemas/media/media";
import type {ICompany} from "@coreModule/database/schemas/company/company";
import { IUser } from "@coreModule/database/schemas/user/user";
import { ICurrency } from "@coreModule/database/schemas/currency/currency";
import { IListingCategory } from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import { normalizeSchemaPermissions } from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import publicMediaPlugin from "@coreModule/database/plugins/publicMediaPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import { COLUMN_TYPE } from "armonia/src/modules/core/database/filter/typeOperators";
import {IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields} from "@coreModule/database/types/plugin-fields";
import { addModelData } from "@coreModule/database/collections";
import { CurrencySimpleSnippet } from "@coreModule/database/schemas/currency/currency.snippets";
import { SimpleUserSnippet } from "@coreModule/database/schemas/user/user.snippets";
import { MediaSimpleSnippet } from "@coreModule/database/schemas/media/media.snippets";
import { ListingCategorySimpleSnippet } from "@marketplaceModule/database/schemas/listingCategory/listingCategory.snippets";
import { CountrySimpleSnippet } from "@coreModule/database/schemas/country/country.snippets";
import { StateSimpleSnippet } from "@coreModule/database/schemas/state/state.snippets";
import { CitySimpleSnippet } from "@coreModule/database/schemas/city/city.snippets";
import {validateSchemaDefAgainstMongoose} from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import {TaskRequestSchemaDef} from "armonia/src/modules/marketplace/api/marketplace/private/taskRequest/taskRequest.schema-def";
import { applyTaskRequestIndexes } from "./taskRequest.indexes";
import { taskRequestViews } from "./taskRequest.views";
import {ICountry} from "@coreModule/database/schemas/country/country";
import {IState} from "@coreModule/database/schemas/state/state";
import {ICity} from "@coreModule/database/schemas/city/city";
import dayjs from "dayjs";
import crypto from "crypto";

export type TaskRequestStatus = "open" | "closed" | "awarded";

export interface ITaskRequest extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    requester: IUser;
    /** Posted on this company's own site: only its providers are matched (D143). Unset on the apex. */
    restrictedToCompany?: ICompany;
    name: string;
    title: string;
    description: string;
    category?: IListingCategory;
    budgetMax?: number;
    currency?: ICurrency;
    address?: {
        street: string;
        postalCode: string;
        country: ICountry;
        state?: IState;
        city: ICity;
        latitude: number;
        longitude: number;
    };
    expiresAt?: Date;
    status: TaskRequestStatus;
    mainImage?: IMedia;
    imageGallery?: IMedia[];
    videoGallery?: IMedia[];
}

const TaskRequestSchema = new Schema<ITaskRequest>(
    {
        requester: {
            type: SchemaTypes.ObjectId,
            ref: "User",
            required: true,
            refAllowlist: SimpleUserSnippet,
            dynamicTableConfiguration: {
                filterable: true,
                sortable: true,
                cellType: COLUMN_TYPE.AVATAR,
            },
            permissions: {
                self: {
                    write: "no-permission",
                },
                others: {
                    write: "no-permission",
                }
            }
        },
        restrictedToCompany: {
            type: SchemaTypes.ObjectId,
            ref: "Company",
            permissions: {self: {write: "no-permission"}, others: {write: "no-permission"}},
            dynamicTableConfiguration: {hideColumn: true},
        },
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
        title: {
            type: SchemaTypes.String,
            required: true,
            trim: true,
            dynamicTableConfiguration: {
                filterable: true,
                sortable: true,
            },
        },
        description: {
            type: SchemaTypes.String,
            required: false,
            dynamicTableConfiguration: {
                filterable: false,
                sortable: false,
                hideColumn: true,
            },
        },
        category: {
            type: SchemaTypes.ObjectId,
            ref: "ListingCategory",
            required: true,
            refAllowlist: ListingCategorySimpleSnippet,
            dynamicTableConfiguration: {
                filterable: true,
                sortable: true,
            },
        },
        budgetMax: {
            type: SchemaTypes.Number,
            required: false,
            min: 1,
            dynamicTableConfiguration: {
                filterable: true,
                sortable: true,
            },
        },
        currency: {
            type: SchemaTypes.ObjectId,
            ref: "Currency",
            required: true,
            refAllowlist: CurrencySimpleSnippet,
            dynamicTableConfiguration: {
                filterable: true,
                sortable: true,
                hideColumn: true,
            },
        },
        address: {
            type: {
                street: {
                    type: SchemaTypes.String,
                    required: true,
                    trim: true,
                    dynamicTableConfiguration: {
                        hideColumn: true,
                    },
                },
                postalCode: {
                    type: SchemaTypes.String,
                    required: true,
                    trim: true,
                    dynamicTableConfiguration: {
                        hideColumn: true,
                    },
                },
                country: {
                    type: SchemaTypes.ObjectId,
                    ref: "Country",
                    required: true,
                    refAllowlist: CountrySimpleSnippet,
                    dynamicTableConfiguration: {
                        hideColumn: true,
                    },
                },
                state: {
                    type: SchemaTypes.ObjectId,
                    ref: "State",
                    refAllowlist: StateSimpleSnippet,
                    dynamicTableConfiguration: {
                        hideColumn: true,
                    },
                },
                city: {
                    type: SchemaTypes.ObjectId,
                    ref: "City",
                    required: true,
                    refAllowlist: CitySimpleSnippet,
                    dynamicTableConfiguration: {
                        hideColumn: true,
                    },
                },
                latitude: {
                    type: SchemaTypes.Number,
                    required: true,
                    dynamicTableConfiguration: {
                        hideColumn: true,
                    },
                },
                longitude: {
                    type: SchemaTypes.Number,
                    required: true,
                    dynamicTableConfiguration: {
                        hideColumn: true,
                    },
                },
            },
            dynamicTableConfiguration: {
                filterable: false,
                sortable: false,
                cellType: COLUMN_TYPE.ADDRESS,
            },
            // An on-site category needs it (checked on save, `assertJobAddress`); a remote job has none (D143).
            required: false,
        },
        expiresAt: {
            type: SchemaTypes.Date,
            required: true,
            permissions: {
                self: {
                    write: "no-permission"
                },
                others: {
                    write: "no-permission"
                }
            },
            dynamicTableConfiguration: {
                filterable: true,
                sortable: true,
            },
        },
        status: {
            type: SchemaTypes.String,
            required: true,
            enum: ["open", "closed", "awarded"],
            default: "open",
            dynamicTableConfiguration: {
                enumTones: {
                    open:      "info",
                    closed:    "neutral",
                    awarded:   "success",
                },
                filterable: true,
                sortable: true,
            },
        },
        mainImage: {
            type: SchemaTypes.ObjectId,
            ref: "Media",
            required: true,
            refAllowlist: MediaSimpleSnippet,
            dynamicTableConfiguration: {
                filterable: false,
                sortable: false,
                cellType: COLUMN_TYPE.AVATAR
            },
        },
        imageGallery: {
            type: [{
                type: SchemaTypes.ObjectId,
                ref: "Media"
            }],
            default: [],
            refAllowlist: MediaSimpleSnippet,
            dynamicTableConfiguration: {
                filterable: false,
                sortable: false,
                cellType: COLUMN_TYPE.AVATAR,
                hideColumn: true,
            },
        },
        videoGallery: {
            type: [{
                type: SchemaTypes.ObjectId,
                ref: "Media"
            }],
            refAllowlist: MediaSimpleSnippet,
            default: [],
            dynamicTableConfiguration: {
                filterable: false,
                hideColumn: true,
            },
        },
    },
    {
        accessMode: "loose",
    }
);

TaskRequestSchema.pre("save", function (next) {
    const taskRequest = this as ITaskRequest;
    if (taskRequest.isNew && !taskRequest.name) {
        const datePart = dayjs(new Date()).format("YYYYMMDD");
        const randomPart = crypto.randomBytes(4).toString("hex");
        taskRequest.name = `TASK-${datePart}-${randomPart}`.toUpperCase();
    }
    next();
});

ownershipPlugin(TaskRequestSchema);
publicMediaPlugin(TaskRequestSchema, {schemaDef: TaskRequestSchemaDef});
auditPlugin(TaskRequestSchema);
softDeletePlugin(TaskRequestSchema);
lifeCyclePlugin(TaskRequestSchema);
applyTaskRequestIndexes(TaskRequestSchema);
const TaskRequest = model<ITaskRequest>("TaskRequest", TaskRequestSchema);
normalizeSchemaPermissions(TaskRequest);
export default TaskRequest;

addModelData(TaskRequest, taskRequestViews);
validateSchemaDefAgainstMongoose(TaskRequestSchema, TaskRequestSchemaDef, "TaskRequest", ["requester", "status", "expiresAt", "restrictedToCompany"]);
