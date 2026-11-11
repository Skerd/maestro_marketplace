import { Document, model, Schema, SchemaTypes } from "mongoose";
import { normalizeSchemaPermissions } from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
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
import {ListingCategorySchemaDef} from "armonia/src/modules/marketplace/api/marketplace/private/listingCategory/listingCategory.schema-def";

export interface IListingCategory extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    company: ICompany;
    name: string;
    slug: string;
    parentListingCategory?: IListingCategory;
    order: number;
}

const ListingCategorySchema = new Schema<IListingCategory>(
    {
        name: {
            type: SchemaTypes.String,
            required: true,
            trim: true,
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

// The slug comes from the name on create, unique per company (UX-05), and stays fixed after so shop links keep working.
ListingCategorySchema.pre("save", async function () {
    if (!this.isNew || this.slug) return;
    // An unpopulated ObjectId answers `_id` with itself; a missing company fails validation right after.
    const companyId = this.company?._id;
    if (!companyId) return;
    this.slug = await generateUniqueSlug(this.name || "category", this.constructor, companyId);
});

ownershipPlugin(ListingCategorySchema);
auditPlugin(ListingCategorySchema);
softDeletePlugin(ListingCategorySchema);
lifeCyclePlugin(ListingCategorySchema);
applyListingCategoryIndexes(ListingCategorySchema);
const ListingCategory = model<IListingCategory>("ListingCategory", ListingCategorySchema);
normalizeSchemaPermissions(ListingCategory);
export default ListingCategory;

addModelData(ListingCategory, listingCategoryViews);
validateSchemaDefAgainstMongoose(ListingCategorySchema, ListingCategorySchemaDef, "ListingCategory");
