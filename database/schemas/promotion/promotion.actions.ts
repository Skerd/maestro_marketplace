import {ObjectId} from "mongodb";
import {action} from "@coreModule/api/actionDecorator";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import {validatePromotionStopForm} from "armonia/src/modules/marketplace/api/marketplace/private/promotion/stopPromotion.action.validator";
import type {StopPromotionFormType} from "armonia/src/modules/marketplace/api/marketplace/private/promotion/promotion.schema-def";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import type {ActionMessage, SingleForm} from "armonia/src/modules/core/types/shared.types";
import type {TransactionRequiredParams} from "@coreModule/utilities/middlewares/transactionUtils";
import {promotionService} from "@marketplaceModule/database/schemas/promotion/promotion.service";
import type {IPromotion} from "@marketplaceModule/database/schemas/promotion/promotion";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {assertOwnerOrAdmin} from "@marketplaceModule/utilities/services/marketplaceAccess";

/** A live promotion whose listing the caller provides (or any, for an admin). */
async function loadOwnPromotion(params: TransactionRequiredParams & SingleForm): Promise<IPromotion> {
    const {logger, languageCode, company, actionUserCtx, session, _id} = params;
    const opts = {logger, languageCode, session};

    const promotion = await promotionService.findOneOrThrow({_id: new ObjectId(_id), company: company._id}, opts);
    // Admins also see soft-deleted rows, so the lookup alone does not rule them out
    if (promotion.deletedAt) {
        throw apiValidationException("promotion_deleted", null, null, languageCode);
    }
    const listing = await listingService.findOneOrThrow({_id: promotion.listing._id, company: company._id}, opts, null, "provider");
    assertOwnerOrAdmin(listing.provider, actionUserCtx, languageCode);
    return promotion;
}

export class PromotionActions {
    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 30},
        transaction: true,
        schema: validateSingleForm,
    })
    async pause(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & SingleForm;
        const {logger, languageCode, actionUserCtx, session} = p;

        logger.start("Pausing promotion...");

        const promotion = await loadOwnPromotion(p);
        if (promotion.lifecycleStatus !== "active") {
            throw apiValidationException("promotion_not_pausable", null, null, languageCode);
        }

        await promotionService.updateByIdOrThrow(promotion._id, {$set: {lifecycleStatus: "paused"}}, {logger, languageCode, session, auditUserId: actionUserCtx.userId});

        logger.finish("Promotion paused!");
        return {message: "Promotion successfully paused"};
    }

    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 30},
        transaction: true,
        schema: validateSingleForm,
    })
    async resume(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & SingleForm;
        const {logger, languageCode, actionUserCtx, session} = p;

        logger.start("Resuming promotion...");

        const promotion = await loadOwnPromotion(p);
        if (promotion.lifecycleStatus !== "paused" || promotion.endAt <= new Date()) {
            throw apiValidationException("promotion_not_resumable", null, null, languageCode);
        }

        await promotionService.updateByIdOrThrow(promotion._id, {$set: {lifecycleStatus: "active"}}, {logger, languageCode, session, auditUserId: actionUserCtx.userId});

        logger.finish("Promotion resumed!");
        return {message: "Promotion successfully resumed"};
    }

    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 30},
        transaction: true,
        schema: validatePromotionStopForm,
    })
    async stop(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & StopPromotionFormType;
        const {logger, languageCode, actionUserCtx, session, stopReason} = p;

        logger.start("Stopping promotion...");

        const promotion = await loadOwnPromotion(p);
        if (promotion.lifecycleStatus === "stopped") {
            throw apiValidationException("promotion_already_stopped", null, null, languageCode);
        }

        await promotionService.updateByIdOrThrow(
            promotion._id,
            {$set: {lifecycleStatus: "stopped", stopReason}},
            {logger, languageCode, session, auditUserId: actionUserCtx.userId},
        );

        logger.finish("Promotion stopped!");
        return {message: "Promotion successfully stopped"};
    }
}
