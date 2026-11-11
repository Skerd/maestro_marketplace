import {ObjectId} from "mongodb";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {buildCreateDataFromSchemaDef, buildUpdateDataFromSchemaDef} from "@coreModule/api/buildUpdateDataFromSchemaDef";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {
    ListingCategorySchemaDef,
    type CreateListingCategoryFormType,
    type EditListingCategoryFormType,
} from "armonia/src/modules/marketplace/api/marketplace/private/listingCategory/listingCategory.schema-def";
import {createListingCategoryFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/listingCategory/createListingCategory.form.validator";
import {editListingCategoryFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/listingCategory/editListingCategory.form.validator";
import {listingCategorySelectFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/listingCategory/listingCategory.select.form.validator";
import ListingCategory, {type IListingCategory} from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import {listingCategoryService} from "@marketplaceModule/database/schemas/listingCategory/listingCategory.service";
import {listingCategoriesToDTO, listingCategoryToDTO} from "@marketplaceModule/utilities/mappers/listingCategory/listingCategoryMapper.dto";
import {listingCategoriesToSelect} from "@marketplaceModule/utilities/mappers/listingCategory/listingCategoryMapper.select";
import type {CrudOptions} from "@coreModule/database/services/baseCrudService";

const buildUpdate = buildUpdateDataFromSchemaDef(ListingCategorySchemaDef);

/** Throws when `parentId` is the category itself or one of its descendants. */
async function assertNotOwnAncestor(categoryId: ObjectId, parentId: ObjectId, companyId: ObjectId, opts: CrudOptions & {languageCode: string}): Promise<void> {
    let current: ObjectId | undefined = parentId;
    while (current) {
        if (current.equals(categoryId)) {
            throw apiValidationException("listing_category_parent_cycle", null, null, opts.languageCode);
        }
        const ancestor = await listingCategoryService.findOne({_id: current, company: companyId}, opts, null, "parentListingCategory");
        current = ancestor?.parentListingCategory?._id;
    }
}

export const basePath = "/api/marketplace/listingCategory";
export const {router} = createCrudRouter<IListingCategory, CreateListingCategoryFormType, EditListingCategoryFormType>({
    collectionName: "listingcategories",
    model: ListingCategory,
    service: listingCategoryService,
    entityName: "ListingCategory",
    selectSearchField: "name",
    selectSort: {order: 1, name: 1},
    defaultSort: {order: 1, name: 1},
    createSchema: createListingCategoryFormSchema,
    editSchema: editListingCategoryFormSchema,
    selectSchema: listingCategorySelectFormSchema,
    toDTO: listingCategoryToDTO,
    toDTOArray: listingCategoriesToDTO,
    toSelect: listingCategoriesToSelect,
    extraSelectFilter: ({excludeCategoryId}) => (excludeCategoryId ? {_id: {$ne: new ObjectId(excludeCategoryId)}} : {}),
    buildCreateData: buildCreateDataFromSchemaDef(ListingCategorySchemaDef),
    buildUpdateData: async (params, writeFields) => {
        const {parentListingCategory, existing, company, session, logger, languageCode} = params;
        if (parentListingCategory && writeFields.parentListingCategory) {
            await assertNotOwnAncestor(existing._id, new ObjectId(parentListingCategory), company._id, {session, logger, languageCode});
        }
        return buildUpdate(params, writeFields);
    },
    rateLimits: {read: 60, write: 30, delete: 20},
});
