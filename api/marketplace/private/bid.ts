import {ObjectId} from "mongodb";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {assertCanDelete} from "@coreModule/database/relationsRegistry";
import {BidActions} from "@marketplaceModule/database/schemas/bid/bid.actions";
import Bid, {type IBid} from "@marketplaceModule/database/schemas/bid/bid";
import {bidService} from "@marketplaceModule/database/schemas/bid/bid.service";
import {taskRequestService} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.service";
import {bidToDTO, bidsToDTOArray} from "@marketplaceModule/utilities/mappers/bid/bidMapper.dto";
import {createBidFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/bid/createBid.form.validator";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import type {CreateBidFormType} from "armonia/src/modules/marketplace/api/marketplace/private/bid/bid.schema-def";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import type {SelectResponse} from "armonia/src/modules/core/types/shared.types";
import {bidsToSelect} from "@marketplaceModule/utilities/mappers/bid/bidMapper.select";
import {assertOwnerOrAdmin, bidVisibilityFilter} from "@marketplaceModule/utilities/services/marketplaceAccess";
import {escapeRegex} from "@coreModule/utilities/helpers";
import {jobBidData} from "@marketplaceModule/utilities/services/jobBids";
import SchemaGuard from "@coreModule/database/security/schemaGuard";

export const basePath = "/api/marketplace/bid";
export const {router} = createCrudRouter<IBid, CreateBidFormType>({
    collectionName: "marketplacebids",
    model: Bid,
    service: bidService,
    entityName: "MarketplaceBid",
    defaultSort: {createdAt: -1},
    createSchema: createBidFormSchema,
    // Not edited via PATCH; accept / reject (withdraw) are BidActions
    editSchema: validateSingleForm,
    toDTO: bidToDTO,
    toDTOArray: bidsToDTOArray,
    toSelect: bidsToSelect,
    documentFilter: async ({company, actionUserCtx, logger, languageCode}) => ({
        company: company._id,
        $and: [await bidVisibilityFilter(company._id, actionUserCtx, {logger, languageCode})],
    }),
    overrideSelectHandler: async (params): Promise<SelectResponse> => {
        const {logger, languageCode, company, name, limit, page, actionUserCtx} = params;

        logger.start("Fetching bids for select...");

        const sanitizedFields = SchemaGuard.sanitizeFields(Bid, {name: {}, amount: {}, taskRequest: {keys: {title: {}}}, currency: {keys: {symbol: {}}}}, "read", actionUserCtx, languageCode);
        const populate = SchemaGuard.generatePopulate(sanitizedFields, Bid.schema);

        const conditions: Record<string, unknown>[] = [
            {company: company._id},
            await bidVisibilityFilter(company._id, actionUserCtx, {logger, languageCode}),
        ];
        if (name?.trim()) {
            conditions.push({name: {$regex: escapeRegex(name.trim()), $options: "i"}});
        }
        const filter = {$and: conditions};

        const [bids, total] = await Promise.all([
            bidService.find(filter, {logger, languageCode}, populate.populate, populate.select, {createdAt: -1}, limit, (page - 1) * limit),
            bidService.count(filter, {logger, languageCode}),
        ]);

        logger.finish("Finished fetching bids for select!");

        return {data: bidsToSelect(bids), total};
    },
    /** Open, unexpired task of someone else; one live bid per bidder. Currency and bidder are derived server-side. */
    buildCreateData: async ({taskRequest: taskRequestId, amount, proposal, deliveryDays, actionUserCtx, company, logger, languageCode, session}) => {
        const taskRequest = await taskRequestService.findOneOrThrow({_id: new ObjectId(taskRequestId), company: company._id}, {session, logger, languageCode});
        return jobBidData(taskRequest, {bidder: new ObjectId(actionUserCtx.userId), amount, proposal, deliveryDays}, {session, logger, languageCode});
    },
    /** Accept / reject (withdraw) via BidActions. */
    buildUpdateData: () => ({}),
    /** The bidder (or an admin) may delete a bid while it is still pending. */
    beforeDelete: async (params, doc) => {
        assertOwnerOrAdmin(doc.bidder, params.actionUserCtx, params.languageCode);
        if (doc.status !== "pending") {
            throw apiValidationException("bid_not_pending", null, null, params.languageCode);
        }
        await assertCanDelete(Bid.modelName, doc._id, params.languageCode, params.session);
    },
    actions: BidActions,
    rateLimits: {read: 60, write: 30, delete: 20},
});
