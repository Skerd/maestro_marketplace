import {ObjectId} from "mongodb";
import {action} from "@coreModule/api/actionDecorator";
import {resolveListingFlagActionFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/listingFlag/resolveListingFlag.action.validator";
import type {ResolveListingFlagFormType} from "armonia/src/modules/marketplace/api/marketplace/private/listingFlag/listingFlag.schema-def";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import type {ActionMessage} from "armonia/src/modules/core/types/shared.types";
import type {TransactionRequiredParams} from "@coreModule/utilities/middlewares/transactionUtils";
import {listingFlagService} from "@marketplaceModule/database/schemas/listingFlag/listingFlag.service";
import type {IListingFlag} from "@marketplaceModule/database/schemas/listingFlag/listingFlag";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";

type ResolveParams = TransactionRequiredParams & ResolveListingFlagFormType;

/** Loads a live, still pending flag for an admin, with the resolution text it will be closed with. */
async function loadPendingFlag(params: ResolveParams, wrongStatusKey: string): Promise<{flag: IListingFlag; resolution: string}> {
    const {session, logger, languageCode, company, actionUserCtx, _id} = params;

    if (!actionUserCtx.isAdmin) {
        throw apiValidationException("admin_only", null, null, languageCode);
    }

    const flag = await listingFlagService.findOneOrThrow({_id: new ObjectId(_id), company: company._id}, {session, logger, languageCode});
    // Admins also see soft-deleted rows, so the lookup alone does not rule them out
    if (flag.deletedAt) {
        throw apiValidationException("listing_flag_deleted", null, null, languageCode);
    }
    if (flag.status !== "pending") {
        throw apiValidationException(wrongStatusKey, null, null, languageCode);
    }

    const resolution = params.resolution.trim();
    if (!resolution) {
        throw apiValidationException("validation_required", null, null, languageCode);
    }
    return {flag, resolution};
}

export class ListingFlagActions {
    /** Upholds the report; with `listingAction: "deactivate"` the listing is taken offline. */
    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 30},
        transaction: true,
        schema: resolveListingFlagActionFormSchema,
    })
    async resolve(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as ResolveParams;
        const {logger, languageCode, session, company, actionUserCtx, _id, listingAction} = p;
        const writeOpts = {session, logger, languageCode, auditUserId: actionUserCtx.userId};

        logger.start(`Resolving listing flag: ${_id}...`);

        const {flag, resolution} = await loadPendingFlag(p, "listing_flag_cannot_resolve_in_current_status");

        await listingFlagService.updateByIdOrThrow(flag._id, {$set: {status: "reviewed", resolution}}, writeOpts);

        if (listingAction === "deactivate") {
            await listingService.updateOne({_id: flag.listing._id, company: company._id}, {$set: {status: "inactive"}}, writeOpts);
        }

        logger.finish(`Resolved listing flag: ${_id}`);
        return {message: "Listing flag resolved"};
    }

    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 30},
        transaction: true,
        schema: resolveListingFlagActionFormSchema,
    })
    async dismiss(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as ResolveParams;
        const {logger, languageCode, session, actionUserCtx, _id} = p;

        logger.start(`Dismissing listing flag: ${_id}...`);

        const {flag, resolution} = await loadPendingFlag(p, "listing_flag_cannot_dismiss_in_current_status");

        await listingFlagService.updateByIdOrThrow(
            flag._id,
            {$set: {status: "dismissed", resolution}},
            {session, logger, languageCode, auditUserId: actionUserCtx.userId},
        );

        logger.finish(`Dismissed listing flag: ${_id}`);
        return {message: "Listing flag dismissed"};
    }
}
