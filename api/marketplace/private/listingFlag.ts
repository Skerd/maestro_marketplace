import {ObjectId} from "mongodb";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {listingFlagService} from "@marketplaceModule/database/schemas/listingFlag/listingFlag.service";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import ListingFlag, {type IListingFlag} from "@marketplaceModule/database/schemas/listingFlag/listingFlag";
import {ListingFlagActions} from "@marketplaceModule/database/schemas/listingFlag/listingFlag.actions";
import {createListingFlagFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/listingFlag/createListingFlag.form.validator";
import {updateListingFlagFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/listingFlag/updateListingFlag.form.validator";
import type {
    CreateListingFlagFormType,
    EditListingFlagFormType,
} from "armonia/src/modules/marketplace/api/marketplace/private/listingFlag/listingFlag.schema-def";
import {listingFlagToDTO, listingFlagsToDTO} from "@marketplaceModule/utilities/mappers/listingFlag/listingFlagMapper.dto";
import {listingFlagsToSelect} from "@marketplaceModule/utilities/mappers/listingFlag/listingFlagMapper.select";
import {assertOwnerOrAdmin} from "@marketplaceModule/utilities/services/marketplaceAccess";
import {restoreUnlessKeyTaken} from "@coreModule/api/restoreUnlessKeyTaken";

export const basePath = "/api/marketplace/listingFlag";
export const {router} = createCrudRouter<IListingFlag, CreateListingFlagFormType, EditListingFlagFormType>({
    collectionName: "listingflags",
    model: ListingFlag,
    service: listingFlagService,
    entityName: "ListingFlag",
    defaultSort: {createdAt: -1},
    selectSearchField: "reason",
    rateLimits: {read: 60, write: 30, delete: 20},
    createSchema: createListingFlagFormSchema,
    editSchema: updateListingFlagFormSchema,
    toDTO: listingFlagToDTO,
    toDTOArray: listingFlagsToDTO,
    toSelect: listingFlagsToSelect,
    actions: ListingFlagActions,
    /** Reports are private: admins review them all, a reporter sees only their own. */
    documentFilter: ({company, actionUserCtx}) => ({
        company: company._id,
        ...(!actionUserCtx.isAdmin && {user: new ObjectId(actionUserCtx.userId)}),
    }),
    extraSelectFilter: ({actionUserCtx}) => (actionUserCtx.isAdmin ? {} : {user: new ObjectId(actionUserCtx.userId)}),
    /** One live report per listing and user; the reporter is the caller. */
    buildCreateData: async ({listing: listingRef, reason, comment, actionUserCtx, company, session, logger, languageCode}) => {
        const opts = {session, logger, languageCode};
        const listing = await listingService.findOneOrThrow({_id: new ObjectId(listingRef), company: company._id}, opts, null, "_id");
        const user = new ObjectId(actionUserCtx.userId);

        if (await listingFlagService.findOne({listing: listing._id, user, company: company._id}, opts, null, "_id")) {
            throw apiValidationException("already_flagged", null, null, languageCode);
        }

        return {
            listing: listing._id,
            user,
            reason,
            ...(comment?.trim() && {comment: comment.trim()}),
        };
    },
    /** Edit report content only, while the report is pending; status changes go through resolve/dismiss. */
    buildUpdateData: ({reason, comment, actionUserCtx, languageCode, existing}, writeFields) => {
        assertOwnerOrAdmin(existing.user, actionUserCtx, languageCode);
        if (existing.status !== "pending") {
            throw apiValidationException("listing_flag_cannot_edit_in_current_status", null, null, languageCode);
        }

        return {
            ...(reason !== undefined && writeFields.reason && {reason}),
            // null unsets an emptied comment
            ...(comment !== undefined && writeFields.comment && {comment: comment.trim() || null}),
        };
    },
    overrideRestoreHandler: restoreUnlessKeyTaken({
        model: ListingFlag,
        service: listingFlagService,
        entityName: "ListingFlag",
        keys: ["listing"],
        sharedKeys: ["user"],
        errorCode: "already_flagged",
    }),
});
