import { Document, model, Schema, SchemaTypes, Types } from "mongoose";
import { normalizeSchemaPermissions } from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import requestablePlugin, {type IRequestablePluginFields} from "@coreModule/database/plugins/requestablePlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import {IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields} from "@coreModule/database/types/plugin-fields";
import { ICompany } from "@coreModule/database/schemas/company/company";
import { applyListingCategoryIndexes } from "./listingCategory.indexes";
import { addModelData } from "@coreModule/database/collections";
import {generateUniqueSlug} from "@coreModule/utilities/helpers/uniqueSlug";
import { listingCategoryViews } from "./listingCategory.views";
import { ListingCategorySimpleSnippet } from "@marketplaceModule/database/schemas/listingCategory/listingCategory.snippets";
import {validateSchemaDefAgainstMongoose} from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import {LIST_NAME_LANGUAGES, listSearchText, type ListNames} from "@coreModule/utilities/helpers/listNames";
import {
    LISTING_CATEGORY_NAME_MAX,
    ListingCategorySchemaDef,
    listingCategoryDeliveries,
    type ListingCategoryDelivery,
} from "armonia/src/modules/marketplace/api/marketplace/private/listingCategory/listingCategory.schema-def";

/**
 * A platform service category (D196): one tree owned by the platform company and shared by every company, built like
 * the D160 platform lists. Seeded from our service taxonomy (`taxonomyId`); a company requests a missing one.
 */
export interface IListingCategory extends Document, IOwnershipPluginFields, IRequestablePluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    company: ICompany;
    /** The English name; `names` holds every panel language. */
    name: string;
    names?: ListNames;
    slug: string;
    delivery: ListingCategoryDelivery;
    parentListingCategory?: IListingCategory;
    order: number;
    /** The taxonomy entry the row was seeded from (its slug in `serviceTaxonomy.json`); a later edit updates the same row. */
    taxonomyId?: string;
    /** Every name, lower-cased, so a select finds the category in any language. */
    searchText?: string;
    /** The top-level section above it (itself at the top): What we provide filters on it (D196). */
    branch?: Types.ObjectId;
}

const SERVER_WRITTEN = {self: {write: "no-permission"}, others: {write: "no-permission"}} as const;

const ListingCategorySchema = new Schema<IListingCategory>(
    {
        name: {
            type: SchemaTypes.String,
            required: true,
            trim: true,
            maxlength: LISTING_CATEGORY_NAME_MAX,
        },
        names: {
            type: new Schema(Object.fromEntries(LIST_NAME_LANGUAGES.map((language) => [language, {
                type: SchemaTypes.String, trim: true, maxlength: LISTING_CATEGORY_NAME_MAX,
            }])), {_id: false}),
            required: false,
            dynamicTableConfiguration: {hideColumn: true},
        },
        taxonomyId: {
            type: SchemaTypes.String,
            required: false,
            permissions: SERVER_WRITTEN,
            dynamicTableConfiguration: {hideColumn: true},
        },
        searchText: {
            type: SchemaTypes.String,
            required: false,
            permissions: SERVER_WRITTEN,
            dynamicTableConfiguration: {hideColumn: true},
        },
        branch: {
            type: SchemaTypes.ObjectId,
            ref: "ListingCategory",
            required: false,
            permissions: SERVER_WRITTEN,
            dynamicTableConfiguration: {hideColumn: true},
        },
        slug: {
            type: SchemaTypes.String,
            // Set by pre-save on create when omitted; not required so create validation can pass first.
            required: false,
            trim: true,
            permissions: {
                self: {write: "no-permission"},
                others: {write: "no-permission"},
            },
            dynamicTableConfiguration: {hideColumn: true},
        },
        delivery: {
            type: SchemaTypes.String,
            enum: listingCategoryDeliveries,
            required: true,
            default: "remote",
            dynamicTableConfiguration: {enumTones: {onsite: "info", remote: "neutral"}},
        },
        parentListingCategory: {
            type: SchemaTypes.ObjectId,
            ref: "ListingCategory",
            refAllowlist: ListingCategorySimpleSnippet,
        },
        order: {
            type: SchemaTypes.Number,
            default: 0,
            dynamicTableConfiguration: {hideColumn: true},
        },
    },
    {
        accessMode: "loose",
        collection: "listingcategories",
    }
);

/** The top-level section of a category under `parentId`, or the category itself (`selfId`) at the top. */
async function branchUnder(parentId: unknown, selfId: Types.ObjectId): Promise<Types.ObjectId> {
    if (!parentId) return selfId;
    const parent = await ListingCategory.findById(parentId).select("_id branch").lean();
    return parent?.branch ?? parent?._id ?? selfId;
}

// The slug comes from the name on create, unique in the tree (UX-05), and stays fixed after so links keep working.
ListingCategorySchema.pre("save", async function () {
    // The taxonomy seed sets every row's branch itself (a parent in the same batch is not stored yet).
    if ((this.isNew && !this.branch) || (!this.isNew && this.isModified("parentListingCategory"))) {
        this.branch = await branchUnder(this.parentListingCategory, this._id);
    }
    if (this.isNew || this.isModified("name") || this.isModified("names")) this.searchText = listSearchText(this.name, this.names);
    if (!this.isNew || this.slug) return;
    // An unpopulated ObjectId answers `_id` with itself; a missing company fails validation right after.
    const companyId = this.company?._id;
    if (!companyId) return;
    this.slug = await generateUniqueSlug(this.name || "category", this.constructor, companyId);
});

// CRUD edit uses updateOne($set), which skips pre("save").
ListingCategorySchema.pre(["updateOne", "findOneAndUpdate"], async function () {
    const update = this.getUpdate();
    if (!update || Array.isArray(update)) return;
    const {$set} = update;
    if (!$set) return;
    if ($set.parentListingCategory !== undefined && $set.branch === undefined) {
        // A category moved under another section takes its section along, with every category below it.
        const moved = await this.model.findOne(this.getQuery()).select("_id branch").lean();
        if (moved) {
            const branch = await branchUnder($set.parentListingCategory, moved._id);
            $set.branch = branch;
            if (String(branch) !== String(moved.branch)) {
                let frontier: Types.ObjectId[] = [moved._id];
                while (frontier.length > 0) {
                    const children = await ListingCategory.find({parentListingCategory: {$in: frontier}}).select("_id").lean();
                    frontier = children.map((child) => child._id);
                    if (frontier.length > 0) await ListingCategory.collection.updateMany({_id: {$in: frontier}}, {$set: {branch}});
                }
            }
        }
    }
    const namesChanged = Object.keys($set).some((key) => key === "names" || key.startsWith("names."));
    if ($set.name === undefined && !namesChanged) return;
    const existing = await this.model.findOne(this.getQuery()).select("name names").session(this.getOptions()?.session ?? null).lean();
    if (!existing) return;
    const names: ListNames = {...(existing.names ?? {}), ...($set.names ?? {})};
    for (const language of LIST_NAME_LANGUAGES) if ($set[`names.${language}`] !== undefined) names[language] = $set[`names.${language}`];
    $set.searchText = listSearchText($set.name ?? existing.name, names);
});

// A platform list (D160, D196): the platform company owns the rows and every company reads them, so listings and jobs
// anywhere point at the same categories; another company's create is a request the platform approves.
ownershipPlugin(ListingCategorySchema, {tenantScoped: false});
requestablePlugin(ListingCategorySchema);
auditPlugin(ListingCategorySchema);
softDeletePlugin(ListingCategorySchema);
lifeCyclePlugin(ListingCategorySchema);
applyListingCategoryIndexes(ListingCategorySchema);
const ListingCategory = model<IListingCategory>("ListingCategory", ListingCategorySchema);
normalizeSchemaPermissions(ListingCategory);
export default ListingCategory;

addModelData(ListingCategory, listingCategoryViews);
/** Server-written paths: the seeded taxonomy id and the search text. */
validateSchemaDefAgainstMongoose(ListingCategorySchema, ListingCategorySchemaDef, "ListingCategory", ["taxonomyId", "searchText"]);
