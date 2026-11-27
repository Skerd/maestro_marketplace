import {ObjectId} from "mongodb";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {addPlatformListTreeRoute, platformListRouteOptions, withoutForeignRequest} from "@coreModule/api/platformListRoute";
import {buildCreateDataFromSchemaDef, buildUpdateDataFromSchemaDef} from "@coreModule/api/buildUpdateDataFromSchemaDef";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import type {TransactionRequiredParams} from "@coreModule/utilities/middlewares/transactionUtils";
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
import {
    listingCategoriesToDTO,
    listingCategoryEditToDTO,
    listingCategoryToDTO,
} from "@marketplaceModule/utilities/mappers/listingCategory/listingCategoryMapper.dto";
import {listingCategoriesToSelect} from "@marketplaceModule/utilities/mappers/listingCategory/listingCategoryMapper.select";
import {marketplaceConfigService} from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig.service";

const buildUpdate = buildUpdateDataFromSchemaDef(ListingCategorySchemaDef);

/** Walks up from the new parent: reaching the category itself would make the tree a loop. */
async function assertNotOwnAncestor(
    categoryId: ObjectId,
    parentId: ObjectId,
    params: Pick<TransactionRequiredParams, "session" | "logger" | "languageCode">,
): Promise<void> {
    const {session, logger, languageCode} = params;
    let current: ObjectId | undefined = parentId;
    const seen = new Set<string>();
    while (current && !seen.has(current.toString())) {
        if (current.equals(categoryId)) {
            throw apiValidationException("listing_category_parent_cycle", "parentListingCategory", null, languageCode);
        }
        seen.add(current.toString());
        const ancestor = await listingCategoryService.findOne(
            {_id: current},
            {session, logger, languageCode, withDeleted: false},
            undefined,
            "parentListingCategory",
        );
        current = nestedEntityToRef(ancestor?.parentListingCategory);
    }
}

export const basePath = "/api/marketplace/listingCategory";

const platformList = platformListRouteOptions<IListingCategory, CreateListingCategoryFormType>({
    model: ListingCategory,
    collectionName: "listingcategories",
    toDTO: listingCategoryToDTO,
    service: listingCategoryService,
    buildCreateData: buildCreateDataFromSchemaDef(ListingCategorySchemaDef),
    // The panel's page is `/tenancy/systemSettings/listingcategories`, the collection name (the default).
});

// A platform list (D160, D196): one tree owned by the platform company and read by every company; only the platform
// company edits it, and another company's create is a request the platform approves.
export const {router} = createCrudRouter<IListingCategory, CreateListingCategoryFormType, EditListingCategoryFormType>({
    collectionName: "listingcategories",
    model: ListingCategory,
    service: listingCategoryService,
    entityName: "ListingCategory",
    // Every name, so a company finds "Hidraulikë" as well as "Plumbing"; the label names the parent (many share "Repair").
    selectSearchField: "searchText",
    selectProjection: "_id name names parentListingCategory",
    selectPopulate: [{path: "parentListingCategory", select: "name names"}],
    selectSort: {order: 1, name: 1},
    defaultSort: {order: 1, name: 1},
    createSchema: createListingCategoryFormSchema,
    editSchema: editListingCategoryFormSchema,
    selectSchema: listingCategorySelectFormSchema,
    toDTO: listingCategoryToDTO,
    toDTOArray: listingCategoriesToDTO,
    toSelect: listingCategoriesToSelect,
    ...platformList,
    // After the platform list's options, which bring their own: only the single read, which the edit form loads,
    // carries every language's name; the request record stays the requester's and the platform's.
    enrichSingle: async (doc, params) => withoutForeignRequest(listingCategoryEditToDTO(doc), params.company),
    // The platform list's approved rows, without the category being edited.
    extraSelectFilter: async (params) => {
        const filter: Record<string, unknown> = {...await platformList.extraSelectFilter(params)};
        const {excludeCategoryId, topLevel, inCompanyBranches, company, session, logger, languageCode} = params;
        if (excludeCategoryId && ObjectId.isValid(excludeCategoryId as string)) filter._id = {$ne: new ObjectId(excludeCategoryId as string)};
        // What we provide (D196): the settings page picks among the sections, and the listing form offers only the
        // sections the company works in, when it picked any.
        if (topLevel === true) filter.parentListingCategory = null;
        if (inCompanyBranches === true) {
            const branches = await marketplaceConfigService.branchesOf(company._id, {session, logger, languageCode});
            if (branches.length > 0) filter.branch = {$in: branches};
        }
        return filter;
    },
    buildUpdateData: async (params, writeFields) => {
        const data = buildUpdate(params, writeFields);
        if (data.parentListingCategory) await assertNotOwnAncestor(params.existing._id, data.parentListingCategory, params);
        return data;
    },
    rateLimits: {read: 60, write: 30, delete: 20},
});

// The hierarchy view (D196): one level at a time (about 3,000 services), or a search in any language with each match's path.
addPlatformListTreeRoute(router, {model: ListingCategory, service: listingCategoryService, parentField: "parentListingCategory"});
