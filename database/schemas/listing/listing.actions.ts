import {ObjectId} from "mongodb";
import {action} from "@coreModule/api/actionDecorator";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import type {TransactionRequiredParams} from "@coreModule/utilities/middlewares/transactionUtils";
import type {IListing, ListingStatus} from "@marketplaceModule/database/schemas/listing/listing";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {assertOwnerOrAdmin} from "@marketplaceModule/utilities/services/marketplaceAccess";
import type {ActionMessage, SingleForm} from "armonia/src/modules/core/types/shared.types";

/**
 * `status` is write: no-permission so PATCH can't change it, which means no role
 * can hold it either. Like the reservation actions, the gate is write access to
 * an ordinary listing field, plus ownership of the listing.
 */
async function loadOwnListing(params: TransactionRequiredParams & SingleForm): Promise<IListing> {
    const {logger, languageCode, company, actionUserCtx, session, _id} = params;

    const listing = await listingService.findOneOrThrow({_id: new ObjectId(_id), company: company._id}, {logger, languageCode, session});
    assertOwnerOrAdmin(listing.provider, actionUserCtx, languageCode);
    return listing;
}

async function setStatus(params: TransactionRequiredParams & SingleForm, listing: IListing, status: ListingStatus): Promise<void> {
    const {logger, languageCode, session, actionUserCtx} = params;
    await listingService.updateByIdOrThrow(listing._id, {$set: {status}}, {logger, languageCode, session, auditUserId: actionUserCtx.userId});
}

export class ListingActions {
    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 30},
        transaction: true,
        schema: validateSingleForm,
    })
    async activate(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & SingleForm;
        p.logger.start("Activating listing...");

        const listing = await loadOwnListing(p);
        // An active listing must be orderable: createFromListing prices it from these fields
        if (listing.price == null || !listing.priceCurrency) {
            throw apiValidationException("listing_price_required", null, null, p.languageCode);
        }
        await setStatus(p, listing, "active");

        p.logger.finish("Listing activated!");
        return {message: "Listing successfully activated!"};
    }

    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 30},
        transaction: true,
        schema: validateSingleForm,
    })
    async deactivate(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & SingleForm;
        p.logger.start("Deactivating listing...");

        const listing = await loadOwnListing(p);
        await setStatus(p, listing, "inactive");

        p.logger.finish("Listing deactivated!");
        return {message: "Listing successfully deactivated!"};
    }
}
