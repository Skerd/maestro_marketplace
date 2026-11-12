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
import type {RequestHandler} from "express";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {assertCanDelete} from "@coreModule/database/relationsRegistry";
import {
    assertMarketplaceOperatorSession,
    findMarketplaceOperatorId,
    marketplaceCategoryClause,
} from "@marketplaceModule/utilities/services/marketplaceOperator";
import authMW, {type AuthenticatedMWType} from "@coreModule/utilities/middlewares/authMW";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import type {ListingCategoryAccessResponse} from "armonia/src/modules/marketplace/api/marketplace/private/listingCategory/listingCategory.dto";

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

/** Creating or editing a category is the operator's (D144); every company reads the tree. */
const operatorOnly: RequestHandler = (req, _res, next) => {
    assertMarketplaceOperatorSession(req.body.company._id, req.body.languageCode)
        .then(() => next())
        .catch(next);
};

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
    // One tree for every company (D144): reads, edits and deletes find the operator's rows, never the session company's.
    documentFilter: () => marketplaceCategoryClause(),
    extraSelectFilter: async ({excludeCategoryId}) => ({
        ...(await marketplaceCategoryClause()),
        ...(excludeCategoryId ? {_id: {$ne: new ObjectId(excludeCategoryId)}} : {}),
    }),
    createMiddleware: [operatorOnly],
    editMiddleware: [operatorOnly],
    beforeDelete: async ({company, languageCode, session}, doc) => {
        await assertMarketplaceOperatorSession(company._id, languageCode);
        // Listings and jobs of every company point at the tree: count them all, not only the operator's.
        await asCrossTenant("a shared category is used by every company's listings and jobs", () =>
            assertCanDelete(ListingCategory.modelName, doc._id, languageCode, session));
    },
    afterRestore: async ({company, languageCode}) => {
        await assertMarketplaceOperatorSession(company._id, languageCode);
    },
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

/** Whether the session company maintains the shared tree (D144): the panel shows the tree read-only to every other. */
router.post(
    "/access",
    authMW("private"),
    rateLimiter({windowMs: 60000, max: 60}),
    asyncHandler(async ({company}: AuthenticatedMWType): Promise<ListingCategoryAccessResponse> => {
        const operatorId = await findMarketplaceOperatorId();
        return {data: {canManage: !!operatorId && operatorId.equals(company._id)}};
    }),
);
