import {ObjectId, type ClientSession} from "mongodb";
import {createCrudRouter, selectIdsOf, type CrudCreateParams} from "@coreModule/api/crudRouterFactory";
import SchemaGuard from "@coreModule/database/security/schemaGuard";
import {escapeRegex} from "@coreModule/utilities/helpers";
import {assertCanDelete} from "@coreModule/database/relationsRegistry";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {orderSeller} from "@marketplaceModule/utilities/services/portalBuyerTargets";
import authMW from "@coreModule/utilities/middlewares/authMW";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import {transactionHandler} from "@coreModule/utilities/middlewares/transactionHandler";
import {validateFormZod} from "@coreModule/utilities/middlewares/validateFormZod";
import {createReviewFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/review/createReview.form.validator";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import type {CreateReviewFormType} from "armonia/src/modules/marketplace/api/marketplace/private/review/review.schema-def";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {orderService} from "@marketplaceModule/database/schemas/order/order.service";
import Review, {type IReview} from "@marketplaceModule/database/schemas/review/review";
import {reviewService} from "@marketplaceModule/database/schemas/review/review.service";
import {reviewToDTO, reviewsToDTO} from "@marketplaceModule/utilities/mappers/review/reviewMapper.dto";
import {refreshListingRating} from "@marketplaceModule/domain/reviews/listingRating";
import {reviewsToSelect} from "@marketplaceModule/utilities/mappers/review/reviewMapper.select";
import {asPortalBuyer, isOrderParty} from "@marketplaceModule/utilities/services/marketplaceAccess";
import {restoreUnlessKeyTaken} from "@coreModule/api/restoreUnlessKeyTaken";
import type {serverLogger} from "@coreModule/loggers/serverLog";

/** Recomputes a listing's average rating and review count from its live reviews. */
/** Keeps the reviewed listing's stored rating in step with its reviews. */
async function recalculateListingRating(
    review: IReview,
    ctx: {session: ClientSession; logger: serverLogger; languageCode: string},
): Promise<void> {
    if (!review.listing) return;
    await refreshListingRating(review.listing._id, ctx);
}

/** The customer reviews a completed order once; listing and reviewer are derived server-side. */
async function buildReviewCreate({order: orderRef, rating, comment, actionUserCtx, company, session, logger, languageCode}: CrudCreateParams<CreateReviewFormType>) {
    const opts = {session, logger, languageCode};
    const order = await orderService.findOneOrThrow({_id: new ObjectId(orderRef), company: company._id}, opts);

    if (order.status !== "completed") {
        throw apiValidationException("order_must_be_completed_to_review", null, null, languageCode);
    }
    if (!isOrderParty(order, actionUserCtx.userId, "customer")) {
        throw apiValidationException("only_customer_can_review", null, null, languageCode);
    }
    if (await reviewService.findOne({order: order._id, company: company._id}, opts, null, "_id")) {
        throw apiValidationException("order_already_reviewed", null, null, languageCode);
    }

    return {
        order: order._id,
        ...(order.listing && {listing: order.listing._id}),
        rating,
        comment: comment ?? "",
        reviewer: new ObjectId(actionUserCtx.userId),
    };
}

export const basePath = "/api/marketplace/review";
export const {router} = createCrudRouter<IReview, CreateReviewFormType>({
    collectionName: "reviews",
    model: Review,
    service: reviewService,
    entityName: "Review",
    defaultSort: {createdAt: -1},
    // A review reads as the rating, who wrote it and the listing (D162: the chat's "Share a record" list), so the
    // select populates both; the search matches the comment.
    overrideSelectHandler: async (params) => {
        const {logger, languageCode, actionUserCtx, company, name, page, limit, dslFilterQuery} = params;
        logger.start("Fetching reviews for select...");

        const sanitizedFields = SchemaGuard.sanitizeFields(
            Review,
            {rating: {}, comment: {}, listing: {keys: {title: {}, name: {}}}, reviewer: {keys: {name: {}, surname: {}}}},
            "read", actionUserCtx, languageCode,
        );
        const populate = SchemaGuard.generatePopulate(sanitizedFields, Review.schema);

        const filter: Record<string, unknown> = {company: company._id};
        const ids = selectIdsOf(params);
        if (ids.length > 0) {
            filter._id = {$in: ids};
        } else {
            const search = String(name ?? "").trim();
            if (search) {
                if (!sanitizedFields.comment) return {data: [], total: 0};
                filter.comment = {$regex: escapeRegex(search), $options: "i"};
            }
            if (dslFilterQuery && Object.keys(dslFilterQuery as object).length > 0) filter.$and = [dslFilterQuery];
        }

        const [reviews, total] = await Promise.all([
            reviewService.find(filter, {logger, languageCode}, populate.populate, populate.select || "", {createdAt: -1}, limit, (page - 1) * limit),
            reviewService.count(filter, {logger, languageCode}),
        ]);
        logger.finish("Finished fetching reviews for select!");
        return {data: reviewsToSelect(reviews), total};
    },
    rateLimits: {read: 60, write: 30, delete: 20},
    createSchema: createReviewFormSchema,
    // Not edited via PATCH; create-only with admin delete/restore
    editSchema: validateSingleForm,
    toDTO: reviewToDTO,
    toDTOArray: reviewsToDTO,
    toSelect: reviewsToSelect,
    buildCreateData: buildReviewCreate,
    buildUpdateData: () => ({}),
    afterCreate: async (created, params) => {
        await recalculateListingRating(created, params);
    },
    beforeDelete: async (params, doc) => {
        if (!params.actionUserCtx.isAdmin) {
            throw apiValidationException("only_admin_can_delete_review", null, null, params.languageCode);
        }
        await assertCanDelete(Review.modelName, doc._id, params.languageCode, params.session);
    },
    afterDelete: async (params, doc) => {
        await recalculateListingRating(doc, params);
    },
    overrideRestoreHandler: restoreUnlessKeyTaken({
        model: Review,
        service: reviewService,
        entityName: "Review",
        keys: ["order"],
        errorCode: "order_already_reviewed",
        afterRestore: (deleted, params) => recalculateListingRating(deleted, params),
    }),
});

/** Buyer self-service create (storefront account): the same rules as PUT, without the model permission. */
router.put(
    "/createMine",
    authMW("private", {portalBuyer: orderSeller("order")}),
    rateLimiter({windowMs: 60000, max: 30}),
    transactionHandler(),
    validateFormZod(createReviewFormSchema),
    // A buyer's own order bought on the portal is its seller's (D16)
    asyncHandler(async (request: CrudCreateParams<CreateReviewFormType>) => asPortalBuyer(request, async () => request.order, async (params) => {
        const {company, actionUserCtx, session, logger, languageCode} = params;
        const created = await reviewService.create(
            {...await buildReviewCreate(params), company: company._id},
            {session, logger, languageCode, auditUserId: actionUserCtx.userId},
        );
        await recalculateListingRating(created, params);
        return {data: {_id: created._id.toString()}};
    })),
);
