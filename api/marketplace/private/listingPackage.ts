import {ObjectId} from "mongodb";
import SchemaGuard from "@coreModule/database/security/schemaGuard";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {buildCreateDataFromSchemaDef, buildUpdateDataFromSchemaDef} from "@coreModule/api/buildUpdateDataFromSchemaDef";
import {assertCanDelete} from "@coreModule/database/relationsRegistry";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {
    ListingPackageSchemaDef,
    type CreateListingPackageFormType,
    type EditListingPackageFormType,
} from "armonia/src/modules/marketplace/api/marketplace/private/listingPackage/listingPackage.schema-def";
import {createListingPackageFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/listingPackage/createListingPackage.form.validator";
import {editListingPackageFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/listingPackage/editListingPackage.form.validator";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import ListingPackage, {type IListingPackage} from "@marketplaceModule/database/schemas/listingPackage/listingPackage";
import {listingPackageService} from "@marketplaceModule/database/schemas/listingPackage/listingPackage.service";
import {listingPackageToDTO, listingPackagesToDTOArray} from "@marketplaceModule/utilities/mappers/listingPackage/listingPackageMapper.dto";
import {listingPackagesToSelect} from "@marketplaceModule/utilities/mappers/listingPackage/listingPackageMapper.select";
import {assertOwnerOrAdmin} from "@marketplaceModule/utilities/services/marketplaceAccess";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {marketplaceConfigService} from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig.service";

const buildCreate = buildCreateDataFromSchemaDef(ListingPackageSchemaDef);
const buildUpdate = buildUpdateDataFromSchemaDef(ListingPackageSchemaDef);

export const basePath = "/api/marketplace/listingPackage";
export const {router} = createCrudRouter<IListingPackage, CreateListingPackageFormType, EditListingPackageFormType>({
    collectionName: "listingpackages",
    model: ListingPackage,
    service: listingPackageService,
    entityName: "ListingPackage",
    defaultSort: {order: 1, name: 1},
    createSchema: createListingPackageFormSchema,
    editSchema: editListingPackageFormSchema,
    toDTO: listingPackageToDTO,
    toDTOArray: listingPackagesToDTOArray,
    toSelect: listingPackagesToSelect,
    buildCreateData: async (params) => {
        const {session, logger, languageCode, actionUserCtx, company} = params;

        const foundListing = await listingService.findOne(
            {_id: new ObjectId(params.listing), company: company._id, provider: new ObjectId(actionUserCtx.userId)},
            {session, logger, languageCode},
        );
        if (!foundListing) {
            throw apiValidationException("only_listing_provider_can_create_package", null, null, languageCode);
        }

        const data = buildCreate(params);
        // Priced in the listing's currency unless another is picked; the marketplace currency when the listing has none.
        const currency = data.price.currency ?? nestedEntityToRef(foundListing.priceCurrency) ?? (await marketplaceConfigService.currencyRefOf(company._id, {session, languageCode}));
        return {...data, price: {...data.price, currency}, provider: foundListing.provider._id};
    },
    buildUpdateData: (params, writeFields) => {
        assertOwnerOrAdmin(params.existing.provider, params.actionUserCtx, params.languageCode);
        return buildUpdate(params, writeFields);
    },
    afterCreate: async (created, params) => {
        const {session, logger, languageCode} = params;
        await listingService.updateByIdOrThrow(
            created.listing._id,
            {$addToSet: {listingPackages: created._id}},
            {session, logger, languageCode},
        );
    },
    beforeDelete: async (params, doc) => {
        if (!params.actionUserCtx.isAdmin && doc.provider._id.toString() !== params.actionUserCtx.userId) {
            throw apiValidationException("only_listing_provider_can_delete_package", null, null, params.languageCode);
        }
        await assertCanDelete(ListingPackage.modelName, doc._id, params.languageCode, params.session);
    },
    afterDelete: async (params, doc) => {
        const {session, logger, languageCode} = params;
        await listingService.updateByIdOrThrow(
            doc.listing._id,
            {$pull: {listingPackages: doc._id}},
            {session, logger, languageCode},
        );
    },
    overrideRestoreHandler: async (params) => {
        const {logger, languageCode, session, _id, company, actionUserCtx} = params;
        logger.start(`Restoring ListingPackage ${_id}...`);
        SchemaGuard.checkModelPermission(ListingPackage, "restore", actionUserCtx, languageCode);
        const restored = await listingPackageService.restoreOneOrThrow(
            {_id: new ObjectId(_id), company: company._id},
            {session, logger, languageCode, auditUserId: actionUserCtx.userId},
        );
        // Throws when the listing itself is deleted, which rolls the restore back
        await listingService.updateByIdOrThrow(
            restored.listing._id,
            {$addToSet: {listingPackages: restored._id}},
            {session, logger, languageCode},
        );
        logger.finish(`Restored ListingPackage ${_id}`);
        return {message: "ListingPackage successfully restored"};
    },
    rateLimits: {read: 60, write: 30, delete: 20},
});
