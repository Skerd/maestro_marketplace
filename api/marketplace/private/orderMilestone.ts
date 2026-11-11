import {ObjectId} from "mongodb";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import {orderMilestoneFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/orderMilestone/orderMilestone.form.validator";
import OrderMilestone, {type IOrderMilestone} from "@marketplaceModule/database/schemas/orderMilestone/orderMilestone";
import {orderMilestoneService} from "@marketplaceModule/database/schemas/orderMilestone/orderMilestone.service";
import {orderMilestoneToDTO, orderMilestonesToDTO} from "@marketplaceModule/utilities/mappers/orderMilestone/orderMilestoneMapper.dto";
import {orderMilestonesToSelect} from "@marketplaceModule/utilities/mappers/orderMilestone/orderMilestoneMapper.select";
import {orderChildFilter} from "@marketplaceModule/utilities/services/marketplaceAccess";

/**
 * Read-only: milestones are written by OrderActions.createMilestone (model create / delete / restore are
 * no-permission). Non-admins only see the milestones of their own orders.
 */
export const basePath = "/api/marketplace/orderMilestone";
export const {router} = createCrudRouter<IOrderMilestone>({
    collectionName: "ordermilestones",
    model: OrderMilestone,
    service: orderMilestoneService,
    entityName: "OrderMilestone",
    defaultSort: {orderIndex: 1},
    listSchema: orderMilestoneFormSchema,
    createSchema: validateSingleForm,
    buildCreateData: () => ({}),
    editSchema: validateSingleForm,
    buildUpdateData: () => ({}),
    toDTO: orderMilestoneToDTO,
    toDTOArray: orderMilestonesToDTO,
    toSelect: orderMilestonesToSelect,
    documentFilter: async ({company, actionUserCtx, logger, languageCode}) => ({
        company: company._id,
        $and: [await orderChildFilter(company._id, actionUserCtx, {logger, languageCode})],
    }),
    extraListFilter: ({orderId}) => (orderId ? {order: new ObjectId(orderId)} : {}),
    extraSelectFilter: ({company, actionUserCtx, logger, languageCode}) => orderChildFilter(company._id, actionUserCtx, {logger, languageCode}),
    rateLimits: {read: 60, write: 30, delete: 20},
});
