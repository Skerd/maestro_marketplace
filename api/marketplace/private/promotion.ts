import {ObjectId} from "mongodb";
import SchemaGuard from "@coreModule/database/security/schemaGuard";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {buildCreateDataFromSchemaDef} from "@coreModule/api/buildUpdateDataFromSchemaDef";
import {assertCanDelete} from "@coreModule/database/relationsRegistry";
import {
    PromotionSchemaDef,
    type CreatePromotionFormType,
} from "armonia/src/modules/marketplace/api/marketplace/private/promotion/promotion.schema-def";
import {createPromotionFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/promotion/createPromotion.form.validator";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import Promotion, {type IPromotion} from "@marketplaceModule/database/schemas/promotion/promotion";
import {PromotionActions} from "@marketplaceModule/database/schemas/promotion/promotion.actions";
import {promotionService} from "@marketplaceModule/database/schemas/promotion/promotion.service";
import {promotionToDTO, promotionsToDTOArray} from "@marketplaceModule/utilities/mappers/promotion/promotionMapper.dto";
import {promotionsToSelect} from "@marketplaceModule/utilities/mappers/promotion/promotionMapper.select";
import {assertOwnerOrAdmin} from "@marketplaceModule/utilities/services/marketplaceAccess";

const buildCreate = buildCreateDataFromSchemaDef(PromotionSchemaDef);

export const basePath = "/api/marketplace/promotion";
export const {router} = createCrudRouter<IPromotion, CreatePromotionFormType>({
    collectionName: "promotions",
    model: Promotion,
    service: promotionService,
    entityName: "Promotion",
    defaultSort: {startAt: -1},
    selectSearchField: "type",
    rateLimits: {read: 60, write: 20, delete: 20},
    actions: PromotionActions,
    createSchema: createPromotionFormSchema,
    // Not edited via PATCH; pause / resume / stop are PromotionActions
    editSchema: validateSingleForm,
    toDTO: promotionToDTO,
    toDTOArray: promotionsToDTOArray,
    toSelect: promotionsToSelect,
    /** The listing's provider (or an admin) promotes an active listing. */
    buildCreateData: async (params) => {
        const {session, logger, languageCode, company, actionUserCtx} = params;
        const listing = await listingService.findOneOrThrow(
            {_id: new ObjectId(params.listing), company: company._id, status: "active"},
            {session, logger, languageCode},
            null,
            "_id provider",
        );
        assertOwnerOrAdmin(listing.provider, actionUserCtx, languageCode);
        return {...buildCreate(params), listing: listing._id};
    },
    /** Pause / resume / stop are PromotionActions. */
    buildUpdateData: () => ({}),
    afterCreate: async (created, params) => {
        const {session, logger, languageCode} = params;
        await listingService.updateByIdOrThrow(created.listing._id, {$addToSet: {promotions: created._id}}, {session, logger, languageCode});
    },
    beforeDelete: async (params, doc) => {
        const {session, logger, languageCode, company, actionUserCtx} = params;
        const listing = await listingService.findOneOrThrow({_id: doc.listing._id, company: company._id}, {session, logger, languageCode}, null, "provider");
        assertOwnerOrAdmin(listing.provider, actionUserCtx, languageCode);
        await assertCanDelete(Promotion.modelName, doc._id, languageCode, session);
    },
    afterDelete: async (params, doc) => {
        const {session, logger, languageCode} = params;
        await listingService.updateByIdOrThrow(doc.listing._id, {$pull: {promotions: doc._id}}, {session, logger, languageCode});
    },
    overrideRestoreHandler: async (params) => {
        const {logger, languageCode, session, _id, company, actionUserCtx} = params;
        logger.start(`Restoring Promotion ${_id}...`);
        SchemaGuard.checkModelPermission(Promotion, "restore", actionUserCtx, languageCode);
        const restored = await promotionService.restoreOneOrThrow(
            {_id: new ObjectId(_id), company: company._id},
            {session, logger, languageCode, auditUserId: actionUserCtx.userId},
        );
        await listingService.updateByIdOrThrow(restored.listing._id, {$addToSet: {promotions: restored._id}}, {session, logger, languageCode});
        logger.finish(`Restored Promotion ${_id}`);
        return {message: "Promotion successfully restored"};
    },
});
