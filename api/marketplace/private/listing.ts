import {ObjectId} from "mongodb";
import {mediaUploadMW} from "@coreModule/utilities/middlewares/mediaUploadMW";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {buildCreateDataFromSchemaDef, buildUpdateDataFromSchemaDef} from "@coreModule/api/buildUpdateDataFromSchemaDef";
import {assertCanDelete} from "@coreModule/database/relationsRegistry";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {ListingActions} from "@marketplaceModule/database/schemas/listing/listing.actions";
import {
    ListingSchemaDef,
    type CreateListingFormType,
    type EditListingFormType,
} from "armonia/src/modules/marketplace/api/marketplace/private/listing/listing.schema-def";
import {createListingFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/listing/createListing.form.validator";
import {editListingFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/listing/editListing.form.validator";
import {listingTableFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/listing/listing.form.validator";
import {listingSelectFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/listing/listing.select.form.validator";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {promotionService} from "@marketplaceModule/database/schemas/promotion/promotion.service";
import {listingToDTO, listingsToDTO} from "@marketplaceModule/utilities/mappers/listing/listingMapper.dto";
import {listingsToSelect} from "@marketplaceModule/utilities/mappers/listing/listingMapper.select";
import {assertOwnerOrAdmin} from "@marketplaceModule/utilities/services/marketplaceAccess";
import {userService} from "@coreModule/database/schemas/user/user.service";
import type {SelectResponse} from "armonia/src/modules/core/types/shared.types";
import {escapeRegex} from "@coreModule/utilities/helpers";
import SchemaGuard from "@coreModule/database/security/schemaGuard";
import Listing, {type IListing} from "@marketplaceModule/database/schemas/listing/listing";
import type {CrudOptions} from "@coreModule/database/services/baseCrudService";
import type {ICompany} from "@coreModule/database/schemas/company/company";
import {marketplaceConfigService} from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig.service";
import {listingHub} from "@marketplaceModule/utilities/services/recordHubs";
import type {AuthenticatedMWType} from "@coreModule/utilities/middlewares/authMW";

async function listingWithHub(doc: IListing, {company, actionUserCtx, languageCode}: Pick<AuthenticatedMWType, "company" | "actionUserCtx" | "logger" | "languageCode">) {
    return {...listingToDTO(doc), ...(await listingHub(doc._id, {companyId: company._id, actionUserCtx, languageCode}))};
}

/** Provider must be the caller or another user in the same company. */
async function assertProviderInCompany(
    provider: ObjectId,
    actionUserId: string,
    company: ICompany,
    languageCode: string,
    opts: CrudOptions,
): Promise<void> {
    if (provider.equals(actionUserId)) return;
    if (!(await userService.findOne({_id: provider, companies: company._id}, opts, null, "_id"))) {
        throw apiValidationException("cant_access_this_user", "provider", null, languageCode);
    }
}

const mediaUpload = mediaUploadMW({
    fields: {
        mainImage: 1,
        imageGallery: 8,
        videoGallery: 3,
    },
    maxFileSize: 250 * 1024 * 1024,
});

const buildCreate = buildCreateDataFromSchemaDef(ListingSchemaDef);
const buildUpdate = buildUpdateDataFromSchemaDef(ListingSchemaDef);

export const basePath = "/api/marketplace/listing";
export const {router} = createCrudRouter<IListing, CreateListingFormType, EditListingFormType>({
    collectionName: "listings",
    model: Listing,
    service: listingService,
    entityName: "Listing",
    defaultSort: {createdAt: -1},
    listSchema: listingTableFormSchema,
    selectSchema: listingSelectFormSchema,
    createSchema: createListingFormSchema,
    editSchema: editListingFormSchema,
    toDTO: listingToDTO,
    toDTOArray: listingsToDTO,
    toSelect: listingsToSelect,
    // The single read is the listing's hub: its orders, bookings, reviews and reports (UX-03); an edit returns it too,
    // so the open sheet keeps its lists.
    enrichSingle: (doc, params) => listingWithHub(doc, params),
    enrichUpdate: (doc, params) => listingWithHub(doc, params),
    createMiddleware: [mediaUpload],
    editMiddleware: [mediaUpload],
    extraListFilter: async ({featuredOnly, company, logger, languageCode}) => {
        if (!featuredOnly) return {};

        /** Dates live on Promotion docs; Listing.promotions is ObjectId[] — cannot $elemMatch startAt/endAt on Listing. */
        const activePromotions = await promotionService.findRunning(company._id, {logger, languageCode});

        return {
            _id: {$in: activePromotions.map((promotion) => nestedEntityToRef(promotion.listing))},
            /** Listing row must reference at least one currently active promotion. */
            promotions: {$in: activePromotions.map((promotion) => promotion._id)},
        };
    },
    overrideSelectHandler: async (params): Promise<SelectResponse> => {
        const {logger, languageCode, company, name, limit, page, activeOnly, actionUserCtx} = params;

        logger.start("Fetching listings for select...");

        const sanitizedFields = SchemaGuard.sanitizeFields(Listing, {name: {}, title: {}}, "read", actionUserCtx, languageCode);
        const populate = SchemaGuard.generatePopulate(sanitizedFields, Listing.schema);

        const filter: Record<string, unknown> = {company: company._id};
        if (name?.trim()) {
            const term = escapeRegex(name.trim());
            filter.$or = [
                {name: {$regex: term, $options: "i"}},
                {title: {$regex: term, $options: "i"}},
            ];
        }
        if (activeOnly) {
            filter.status = "active";
        }

        const [listings, total] = await Promise.all([
            listingService.find(filter, {logger, languageCode}, populate.populate, populate.select, {createdAt: -1}, limit, (page - 1) * limit),
            listingService.count(filter, {logger, languageCode}),
        ]);

        logger.finish("Finished fetching listings for select!");

        return {data: listingsToSelect(listings), total};
    },
    buildCreateData: async (params) => {
        const {actionUserCtx, company, session, logger, languageCode} = params;
        const data = buildCreate(params);
        // A listing priced without a currency is priced in the shop currency (UX-06).
        if (!data.priceCurrency) data.priceCurrency = await marketplaceConfigService.currencyRefOf(company._id, {session, languageCode});
        await assertProviderInCompany(data.provider, actionUserCtx.userId, company, languageCode, {session, logger, languageCode});
        return data;
    },
    buildUpdateData: async (params, writeFields) => {
        const {actionUserCtx, company, session, logger, languageCode, existing} = params;
        assertOwnerOrAdmin(existing.provider, actionUserCtx, languageCode);
        const update = buildUpdate(params, writeFields);
        if (update.provider) {
            await assertProviderInCompany(update.provider, actionUserCtx.userId, company, languageCode, {session, logger, languageCode});
        }
        return update;
    },
    beforeDelete: async (params, doc) => {
        assertOwnerOrAdmin(doc.provider, params.actionUserCtx, params.languageCode);
        await assertCanDelete(Listing.modelName, doc._id, params.languageCode, params.session);
    },
    rateLimits: {read: 60, write: 30, delete: 20},
    actions: ListingActions,
});
