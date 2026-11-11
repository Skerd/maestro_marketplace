import {ObjectId} from "mongodb";
import SchemaGuard from "@coreModule/database/security/schemaGuard";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {buildCreateDataFromSchemaDef, buildUpdateDataFromSchemaDef} from "@coreModule/api/buildUpdateDataFromSchemaDef";
import {assertCanDelete} from "@coreModule/database/relationsRegistry";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {
    ListingAddOnSchemaDef,
    type CreateListingAddOnFormType,
    type EditListingAddOnFormType,
} from "armonia/src/modules/marketplace/api/marketplace/private/listingAddOn/listingAddOn.schema-def";
import {createListingAddOnFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/listingAddOn/createListingAddOn.form.validator";
import {editListingAddOnFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/listingAddOn/editListingAddOn.form.validator";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import ListingAddOn, {type IListingAddOn} from "@marketplaceModule/database/schemas/listingAddOn/listingAddOn";
import {listingAddOnService} from "@marketplaceModule/database/schemas/listingAddOn/listingAddOn.service";
import {listingAddOnToDTO, listingAddOnsToDTOArray} from "@marketplaceModule/utilities/mappers/listingAddOn/listingAddOnMapper.dto";
import {listingAddOnsToSelect} from "@marketplaceModule/utilities/mappers/listingAddOn/listingAddOnMapper.select";
import {assertOwnerOrAdmin} from "@marketplaceModule/utilities/services/marketplaceAccess";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {marketplaceConfigService} from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig.service";

const buildCreate = buildCreateDataFromSchemaDef(ListingAddOnSchemaDef);
const buildUpdate = buildUpdateDataFromSchemaDef(ListingAddOnSchemaDef);

export const basePath = "/api/marketplace/listingAddOn";
export const {router} = createCrudRouter<IListingAddOn, CreateListingAddOnFormType, EditListingAddOnFormType>({
    collectionName: "listingaddons",
    model: ListingAddOn,
    service: listingAddOnService,
    entityName: "ListingAddOn",
    defaultSort: {name: 1},
    createSchema: createListingAddOnFormSchema,
    editSchema: editListingAddOnFormSchema,
    toDTO: listingAddOnToDTO,
    toDTOArray: listingAddOnsToDTOArray,
    toSelect: listingAddOnsToSelect,
    buildCreateData: async (params) => {
        const {session, logger, languageCode, actionUserCtx, company} = params;

        const foundListing = await listingService.findOne(
            {_id: new ObjectId(params.listing), company: company._id, provider: new ObjectId(actionUserCtx.userId)},
            {session, logger, languageCode},
        );
        if (!foundListing) {
            throw apiValidationException("only_listing_provider_can_create_add_on", null, null, languageCode);
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
            {$addToSet: {listingAddOns: created._id}},
            {session, logger, languageCode},
        );
    },
    beforeDelete: async (params, doc) => {
        if (!params.actionUserCtx.isAdmin && doc.provider._id.toString() !== params.actionUserCtx.userId) {
            throw apiValidationException("only_listing_provider_can_delete_add_on", null, null, params.languageCode);
        }
        await assertCanDelete(ListingAddOn.modelName, doc._id, params.languageCode, params.session);
    },
    afterDelete: async (params, doc) => {
        const {session, logger, languageCode} = params;
        await listingService.updateByIdOrThrow(
            doc.listing._id,
            {$pull: {listingAddOns: doc._id}},
            {session, logger, languageCode},
        );
    },
    overrideRestoreHandler: async (params) => {
        const {logger, languageCode, session, _id, company, actionUserCtx} = params;
        logger.start(`Restoring ListingAddOn ${_id}...`);
        SchemaGuard.checkModelPermission(ListingAddOn, "restore", actionUserCtx, languageCode);
        const restored = await listingAddOnService.restoreOneOrThrow(
            {_id: new ObjectId(_id), company: company._id},
            {session, logger, languageCode, auditUserId: actionUserCtx.userId},
        );
        // Throws when the listing itself is deleted, which rolls the restore back
        await listingService.updateByIdOrThrow(
            restored.listing._id,
            {$addToSet: {listingAddOns: restored._id}},
            {session, logger, languageCode},
        );
        logger.finish(`Restored ListingAddOn ${_id}`);
        return {message: "ListingAddOn successfully restored"};
    },
    rateLimits: {read: 60, write: 30, delete: 20},
});
