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

/** Tells the other party of the order that a dispute was opened. */
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
            },
        });
    });
}

export const basePath = "/api/marketplace/dispute";
export const {router} = createCrudRouter<IDispute, CreateDisputeFormType>({
    collectionName: "disputes",
    model: Dispute,
    service: disputeService,
    entityName: "Dispute",
    defaultSort: {createdAt: -1},
    selectSearchField: "reason",
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
    /** Only an admin removes a dispute: an open one blocks delivery acceptance and the payout. */
    overrideRestoreHandler: restoreUnlessKeyTaken({
        model: Dispute,
        service: disputeService,
        entityName: "Dispute",
        keys: ["order"],
        errorCode: "dispute_already_exists_for_order",
    }),
    beforeDelete: async (params, doc) => {
        if (!params.actionUserCtx.isAdmin) {
            throw apiValidationException("user_permissions_not_sufficient", null, null, params.languageCode);
        }
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
