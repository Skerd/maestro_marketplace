import {ObjectId} from "mongodb";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import {orderRevisionFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/orderRevision/orderRevision.form.validator";
import OrderRevision, {type IOrderRevision} from "@marketplaceModule/database/schemas/orderRevision/orderRevision";
import {orderRevisionService} from "@marketplaceModule/database/schemas/orderRevision/orderRevision.service";
import {orderRevisionToDTO, orderRevisionsToDTO} from "@marketplaceModule/utilities/mappers/orderRevision/orderRevisionMapper.dto";
import {orderRevisionsToSelect} from "@marketplaceModule/utilities/mappers/orderRevision/orderRevisionMapper.select";
import {orderChildFilter} from "@marketplaceModule/utilities/services/marketplaceAccess";

/**
 * Read-only: revisions are written by OrderActions.requestRevision (model create / delete / restore are
 * no-permission). Non-admins only see the revisions of their own orders.
 */
export const basePath = "/api/marketplace/orderRevision";
export const {router} = createCrudRouter<IOrderRevision>({
    collectionName: "orderrevisions",
    model: OrderRevision,
    service: orderRevisionService,
    entityName: "OrderRevision",
    defaultSort: {createdAt: -1},
    listSchema: orderRevisionFormSchema,
    createSchema: validateSingleForm,
    buildCreateData: () => ({}),
    editSchema: validateSingleForm,
    buildUpdateData: () => ({}),
    toDTO: orderRevisionToDTO,
    toDTOArray: orderRevisionsToDTO,
    toSelect: orderRevisionsToSelect,
    documentFilter: async ({company, actionUserCtx, logger, languageCode}) => ({
        company: company._id,
        $and: [await orderChildFilter(company._id, actionUserCtx, {logger, languageCode})],
    }),
    extraListFilter: ({orderId}) => (orderId ? {order: new ObjectId(orderId)} : {}),
    extraSelectFilter: ({company, actionUserCtx, logger, languageCode}) => orderChildFilter(company._id, actionUserCtx, {logger, languageCode}),
    rateLimits: {read: 60, write: 30, delete: 20},
});
