import {ObjectId} from "mongodb";
import {createCrudRouter, type CrudCreateParams} from "@coreModule/api/crudRouterFactory";
import {orderSeller} from "@marketplaceModule/utilities/services/portalBuyerTargets";
import authMW from "@coreModule/utilities/middlewares/authMW";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import {transactionHandler} from "@coreModule/utilities/middlewares/transactionHandler";
import {validateFormZod} from "@coreModule/utilities/middlewares/validateFormZod";
import {assertCanDelete} from "@coreModule/database/relationsRegistry";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {runAfterCommit} from "@coreModule/utilities/middlewares/transactionUtils";
import {emitNotificationEvent} from "@coreModule/domain/notifications/notificationEventBus";
import {createDisputeFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/dispute/createDispute.form.validator";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import type {CreateDisputeFormType} from "armonia/src/modules/marketplace/api/marketplace/private/dispute/dispute.schema-def";
import Dispute, {type IDispute} from "@marketplaceModule/database/schemas/dispute/dispute";
import {DisputeActions} from "@marketplaceModule/database/schemas/dispute/dispute.actions";
import {disputeService} from "@marketplaceModule/database/schemas/dispute/dispute.service";
import {orderService} from "@marketplaceModule/database/schemas/order/order.service";
import {NotificationEventCodes} from "@marketplaceModule/domain/notifications/notificationEventCodes";
import {disputeToDTO, disputesToDTO} from "@marketplaceModule/utilities/mappers/dispute/disputeMapper.dto";
import {disputesToSelect} from "@marketplaceModule/utilities/mappers/dispute/disputeMapper.select";
import {restoreUnlessKeyTaken} from "@coreModule/api/restoreUnlessKeyTaken";
import {asPortalBuyer, isOrderParty, orderChildFilter} from "@marketplaceModule/utilities/services/marketplaceAccess";
import {
    assertDisputeOperator,
    assertOperatorSession,
    isMarketplaceOperator,
    notifyOperatorOfDispute,
    OPERATOR_DISPUTES_REASON,
} from "@marketplaceModule/utilities/services/operatorDisputes";
import type {AuthenticatedMWType} from "@coreModule/utilities/middlewares/authMW";
import {schemaSanitizer, type SchemaSanitizerMWType} from "@coreModule/utilities/middlewares/schemaSanitizerMW";
import {dslFilterMW, type DslFilterMWType} from "@coreModule/utilities/middlewares/dslFilterMW";
import SchemaGuard from "@coreModule/database/security/schemaGuard";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {validateTableForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import type {SingleForm, TableForm} from "armonia/src/modules/core/types/shared.types";
import type {Dispute as DisputeDTO, DisputeAccessResponse, DisputeListResponse} from "armonia/src/modules/marketplace/api/marketplace/private/dispute/dispute.dto";

/** A party opens one dispute per non-final order; the initiator is the caller. */
async function buildDisputeCreate({order: orderRef, reason, actionUserCtx, company, session, logger, languageCode}: CrudCreateParams<CreateDisputeFormType>) {
    const opts = {session, logger, languageCode};
    const order = await orderService.findOneOrThrow({_id: new ObjectId(orderRef), company: company._id}, opts);

    if (!isOrderParty(order, actionUserCtx.userId, "customer") && !isOrderParty(order, actionUserCtx.userId, "provider")) {
        throw apiValidationException("only_order_parties_can_raise_dispute", null, null, languageCode);
    }
    if (order.status === "cancelled" || order.status === "completed") {
        throw apiValidationException("cannot_dispute_final_order", null, null, languageCode);
    }
    if (await disputeService.findOne({order: order._id, company: company._id}, opts, null, "_id")) {
        throw apiValidationException("dispute_already_exists_for_order", null, null, languageCode);
    }

    return {
        order: order._id,
        initiator: new ObjectId(actionUserCtx.userId),
        reason: reason.trim(),
    };
}

/** Tells the other party of the order that a dispute was opened, and the marketplace operator, who decides it (D191). */
async function notifyDisputeOpened(created: IDispute, params: CrudCreateParams<CreateDisputeFormType>) {
    const {session, logger, languageCode, company, actionUserCtx} = params;
    const order = await orderService.findOneOrThrow({_id: created.order._id, company: company._id}, {session, logger, languageCode});
    const otherParty = isOrderParty(order, actionUserCtx.userId, "customer") ? order.provider : order.customer;

    await runAfterCommit(session, async () => {
        emitNotificationEvent(NotificationEventCodes.DISPUTE_OPENED, {
            receiverIds: [otherParty._id.toString()],
            payload: {
                companyId: company._id.toString(),
                languageCode,
                disputeId: created._id.toString(),
                orderId: order._id.toString(),
                orderName: order.name,
                // Only the provider's copy opens the dispute in the panel (TD-F133).
                providerId: order.provider._id.toString(),
            },
        });
    });
    await notifyOperatorOfDispute(created, order, {company, languageCode, session, logger});
}

const restoreDispute = restoreUnlessKeyTaken({
    model: Dispute,
    service: disputeService,
    entityName: "Dispute",
    keys: ["order"],
    errorCode: "dispute_already_exists_for_order",
});

export const basePath = "/api/marketplace/dispute";
export const {router} = createCrudRouter<IDispute, CreateDisputeFormType>({
    collectionName: "disputes",
    model: Dispute,
    service: disputeService,
    entityName: "Dispute",
    defaultSort: {createdAt: -1},
    selectSearchField: "reason",
    // The label reads the status and the reason (TD-B234).
    selectProjection: "_id reason status order",
    rateLimits: {read: 60, write: 30, delete: 20},
    createSchema: createDisputeFormSchema,
    // Not edited via PATCH; lifecycle uses /startReview, /resolve, /close
    editSchema: validateSingleForm,
    toDTO: disputeToDTO,
    toDTOArray: disputesToDTO,
    toSelect: disputesToSelect,
    documentFilter: async ({company, actionUserCtx, logger, languageCode}) => ({
        company: company._id,
        $and: [await orderChildFilter(company._id, actionUserCtx, {logger, languageCode})],
    }),
    extraSelectFilter: ({company, actionUserCtx, logger, languageCode}) => orderChildFilter(company._id, actionUserCtx, {logger, languageCode}),
    buildCreateData: buildDisputeCreate,
    afterCreate: notifyDisputeOpened,
    /** Status and resolution via DisputeActions. */
    buildUpdateData: () => ({}),
    /**
     * Only the marketplace operator's admins remove or restore a dispute (D191): an open one blocks delivery acceptance
     * and the payout, so neither party may make it go away.
     */
    overrideRestoreHandler: async (params) => {
        await assertDisputeOperator(params.company._id, params.actionUserCtx, params.languageCode);
        return restoreDispute(params);
    },
    beforeDelete: async (params, doc) => {
        await assertDisputeOperator(params.company._id, params.actionUserCtx, params.languageCode);
        await assertCanDelete(Dispute.modelName, doc._id, params.languageCode, params.session);
    },
    actions: DisputeActions,
});

/** Buyer self-service create (storefront account): the same rules as PUT, without the model permission. */
router.put(
    "/createMine",
    authMW("private", {portalBuyer: orderSeller("order")}),
    rateLimiter({windowMs: 60000, max: 30}),
    transactionHandler(),
    validateFormZod(createDisputeFormSchema),
    // A buyer's own order bought on the portal is its seller's (D16)
    asyncHandler(async (request: CrudCreateParams<CreateDisputeFormType>) => asPortalBuyer(request, async () => request.order, async (params) => {
        const {company, actionUserCtx, session, logger, languageCode} = params;
        const created = await disputeService.create(
            {...await buildDisputeCreate(params), company: company._id},
            {session, logger, languageCode, auditUserId: actionUserCtx.userId},
        );
        await notifyDisputeOpened(created, params);
        return {data: {_id: created._id.toString()}};
    })),
);

/** A dispute on the operator's list (D191): with the company whose order it is, and whether the caller decides it. */
function toOperatorDispute(dispute: IDispute, canDecide: boolean): DisputeDTO {
    return {...disputeToDTO(dispute), ...(canDecide ? {canDecide} : {})};
}

/** The fields the caller may read, plus the company the operator needs to see. */
function operatorReadPopulate(params: SchemaSanitizerMWType): {populate: unknown[]; select?: string} {
    const {populate, select} = SchemaGuard.generatePopulate(params.sanitizedReadFields, Dispute.schema);
    return {
        populate: [...[populate ?? []].flat(), {path: "company", select: "name"}],
        ...(select ? {select: `${select} company`} : {}),
    };
}

/**
 * The marketplace operator's own routes (D191), for its Disputes list in the panel:
 * - POST "/access"          — whether the session company is the operator and the caller decides its disputes
 * - POST "/operator"        — a page of every company's disputes, newest first (the operator only)
 * - POST "/operator/single" — one of them
 * Their decisions are this router's `startReview`, `resolve` and `close` actions, which run in the dispute's company.
 */
router.post(
    "/access",
    authMW("private"),
    rateLimiter({windowMs: 60000, max: 60}),
    asyncHandler(async ({company, actionUserCtx}: AuthenticatedMWType): Promise<DisputeAccessResponse> => {
        const isOperator = await isMarketplaceOperator(company._id);
        return {data: {isOperator, canDecide: isOperator && actionUserCtx.isAdmin}};
    }),
);

router.post(
    "/operator",
    authMW("private"),
    rateLimiter({windowMs: 60000, max: 60}),
    validateFormZod(validateTableForm),
    schemaSanitizer({model: "disputes", requiredModes: ["read"]}),
    dslFilterMW({model: "disputes"}),
    asyncHandler(async (params: AuthenticatedMWType & SchemaSanitizerMWType & DslFilterMWType & TableForm): Promise<DisputeListResponse> => {
        const {company, actionUserCtx, logger, languageCode, limit, offset, sortBy, sortOrder, dslFilterQuery} = params;
        await assertOperatorSession(company._id, languageCode);
        const {populate, select} = operatorReadPopulate(params);
        const filter: Record<string, unknown> = dslFilterQuery && Object.keys(dslFilterQuery).length > 0 ? {$and: [dslFilterQuery]} : {};
        const sort = sortBy && sortOrder ? {[sortBy]: sortOrder === "asc" ? 1 as const : -1 as const} : {createdAt: -1 as const};
        const [docs, total] = await asCrossTenant(OPERATOR_DISPUTES_REASON, () => Promise.all([
            disputeService.find(filter, {logger, languageCode}, populate, select, sort, limit, offset ?? 0),
            disputeService.count(filter, {logger, languageCode}),
        ]));
        return {data: docs.map((doc) => toOperatorDispute(doc, actionUserCtx.isAdmin)), total};
    }),
);

router.post(
    "/operator/single",
    authMW("private"),
    rateLimiter({windowMs: 60000, max: 60}),
    validateFormZod(validateSingleForm),
    schemaSanitizer({model: "disputes", requiredModes: ["read"]}),
    asyncHandler(async (params: AuthenticatedMWType & SchemaSanitizerMWType & SingleForm): Promise<DisputeDTO> => {
        const {company, actionUserCtx, logger, languageCode, _id} = params;
        await assertOperatorSession(company._id, languageCode);
        const {populate, select} = operatorReadPopulate(params);
        const dispute = await asCrossTenant(OPERATOR_DISPUTES_REASON, () =>
            disputeService.findOneOrThrow({_id: new ObjectId(_id)}, {logger, languageCode}, populate, select));
        return toOperatorDispute(dispute, actionUserCtx.isAdmin);
    }),
);
