import {ObjectId} from "mongodb";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import {orderDeliveryFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/orderDelivery/orderDelivery.form.validator";
import OrderDelivery, {type IOrderDelivery} from "@marketplaceModule/database/schemas/orderDelivery/orderDelivery";
import {orderDeliveryService} from "@marketplaceModule/database/schemas/orderDelivery/orderDelivery.service";
import {orderDeliveryToDTO, orderDeliveriesToDTO} from "@marketplaceModule/utilities/mappers/orderDelivery/orderDeliveryMapper.dto";
import {orderDeliveriesToSelect} from "@marketplaceModule/utilities/mappers/orderDelivery/orderDeliveryMapper.select";
import {orderChildFilter} from "@marketplaceModule/utilities/services/marketplaceAccess";

/**
 * Read-only: deliveries are written by OrderActions.submitDelivery (model create / delete / restore are
 * no-permission). Non-admins only see the deliveries of their own orders.
 */
export const basePath = "/api/marketplace/orderDelivery";
export const {router} = createCrudRouter<IOrderDelivery>({
    collectionName: "orderdeliveries",
    model: OrderDelivery,
    service: orderDeliveryService,
    entityName: "OrderDelivery",
    defaultSort: {createdAt: -1},
    listSchema: orderDeliveryFormSchema,
    createSchema: validateSingleForm,
    buildCreateData: () => ({}),
    editSchema: validateSingleForm,
    buildUpdateData: () => ({}),
    toDTO: orderDeliveryToDTO,
    toDTOArray: orderDeliveriesToDTO,
    toSelect: orderDeliveriesToSelect,
    documentFilter: async ({company, actionUserCtx, logger, languageCode}) => ({
        company: company._id,
        $and: [await orderChildFilter(company._id, actionUserCtx, {logger, languageCode})],
    }),
    extraListFilter: ({orderId}) => (orderId ? {order: new ObjectId(orderId)} : {}),
    extraSelectFilter: ({company, actionUserCtx, logger, languageCode}) => orderChildFilter(company._id, actionUserCtx, {logger, languageCode}),
    rateLimits: {read: 60, write: 30, delete: 20},
});
