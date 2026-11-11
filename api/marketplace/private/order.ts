import {ObjectId} from "mongodb";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {assertCanDelete} from "@coreModule/database/relationsRegistry";
import SchemaGuard from "@coreModule/database/security/schemaGuard";
import {escapeRegex} from "@coreModule/utilities/helpers";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import {OrderActions} from "@marketplaceModule/database/schemas/order/order.actions";
import Order, {type IOrder} from "@marketplaceModule/database/schemas/order/order";
import {orderService} from "@marketplaceModule/database/schemas/order/order.service";
import {reviewService} from "@marketplaceModule/database/schemas/review/review.service";
import {orderDeliveryService} from "@marketplaceModule/database/schemas/orderDelivery/orderDelivery.service";
import {orderToBuyerDTO, orderToDTO, ordersToDTO} from "@marketplaceModule/utilities/mappers/order/orderMapper.dto";
import {ordersToSelect} from "@marketplaceModule/utilities/mappers/order/orderMapper.select";
import {disputeService} from "@marketplaceModule/database/schemas/dispute/dispute.service";
import {orderPartyFilter} from "@marketplaceModule/utilities/services/marketplaceAccess";
import {orderSelectFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/order/order.select.form.validator";
import type {SelectResponse} from "armonia/src/modules/core/types/shared.types";
import type {BaseCrudService, CrudOptions} from "@coreModule/database/services/baseCrudService";
import {getModelCollectedData} from "@coreModule/database/collections";
import authMW, {type AuthenticatedMWType} from "@coreModule/utilities/middlewares/authMW";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import {validateFormZod} from "@coreModule/utilities/middlewares/validateFormZod";
import {bookingService} from "@marketplaceModule/database/schemas/booking/booking.service";
import {bookingsToDTOArray} from "@marketplaceModule/utilities/mappers/booking/bookingMapper.dto";
import {
    myServiceOrdersFormSchema,
    type MyServiceOrdersFormType,
} from "armonia/src/modules/marketplace/api/marketplace/private/order/myServiceOrders.form.validator";
import type {Document, Model} from "mongoose";
import OrderDelivery from "@marketplaceModule/database/schemas/orderDelivery/orderDelivery";
import OrderMilestone from "@marketplaceModule/database/schemas/orderMilestone/orderMilestone";
import OrderRevision from "@marketplaceModule/database/schemas/orderRevision/orderRevision";
import {orderMilestoneService} from "@marketplaceModule/database/schemas/orderMilestone/orderMilestone.service";
import {orderRevisionService} from "@marketplaceModule/database/schemas/orderRevision/orderRevision.service";
import {orderDeliveriesToDTO} from "@marketplaceModule/utilities/mappers/orderDelivery/orderDeliveryMapper.dto";
import {orderMilestonesToDTO} from "@marketplaceModule/utilities/mappers/orderMilestone/orderMilestoneMapper.dto";
import {orderRevisionsToDTO} from "@marketplaceModule/utilities/mappers/orderRevision/orderRevisionMapper.dto";
import {isPortalZoneOrigin} from "@coreModule/utilities/marketing/portalOrigin";
import {portalPurchaseRoute} from "@coreModule/utilities/marketing/portalStorefront";
import {loadProviderAvailability} from "@marketplaceModule/utilities/services/providerAvailability";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {escrowTransactionService} from "@financeModule/database/schemas/escrowTransaction/escrowTransaction.service";
import Dispute from "@marketplaceModule/database/schemas/dispute/dispute";
import Booking from "@marketplaceModule/database/schemas/booking/booking";
import Review from "@marketplaceModule/database/schemas/review/review";
import {disputesToDTO} from "@marketplaceModule/utilities/mappers/dispute/disputeMapper.dto";
import {reviewsToDTO} from "@marketplaceModule/utilities/mappers/review/reviewMapper.dto";

const ACTIVE_DISPUTE_STATUSES = ["open", "under_review"];

async function ordersWithSubmittedDelivery(orderIds: ObjectId[], companyId: ObjectId | undefined, opts: CrudOptions): Promise<Set<string>> {
    const filter: Record<string, unknown> = {order: {$in: orderIds}, status: "submitted"};
    if (companyId) filter.company = companyId;
    const deliveries = await orderDeliveryService.find(filter, opts, null, "order");
    return new Set(deliveries.map((delivery) => delivery.order._id.toString()));
}

async function ordersWithActiveDispute(orderIds: ObjectId[], companyId: ObjectId | undefined, opts: CrudOptions): Promise<Set<string>> {
    const filter: Record<string, unknown> = {order: {$in: orderIds}, status: {$in: ACTIVE_DISPUTE_STATUSES}};
    if (companyId) filter.company = companyId;
    const disputes = await disputeService.find(filter, opts, null, "order");
    return new Set(disputes.map((dispute) => dispute.order._id.toString()));
}

/**
 * One related list for the order sheet, read through SchemaGuard like the CRUD
 * routes; undefined when the caller has no read access to that model.
 */
async function readOrderChildren<T extends Document>(
    model: Model<T>,
    collectionName: string,
    service: BaseCrudService<T, any>,
    order: IOrder,
    params: AuthenticatedMWType,
    sort: Record<string, 1 | -1>,
): Promise<T[] | undefined> {
    const {logger, languageCode, company, actionUserCtx} = params;
    let readFields;
    try {
        readFields = SchemaGuard.sanitizeFields(model, getModelCollectedData(collectionName).readFields!, "read", actionUserCtx, languageCode);
    } catch {
        return undefined;
    }
    const populate = SchemaGuard.generatePopulate(readFields, model.schema);
    return service.find({order: order._id, company: company._id}, {logger, languageCode}, populate.populate, populate.select, sort);
}

export const basePath = "/api/marketplace/order";

export const {router} = createCrudRouter<IOrder>({
    collectionName: "orders",
    model: Order,
    service: orderService,
    entityName: "Order",
    defaultSort: {createdAt: -1},
    // Orders are created by OrderActions.createFromListing / BidActions.accept; model create is no-permission, so PUT is refused
    createSchema: validateSingleForm,
    buildCreateData: () => ({}),
    // Not edited via PATCH; lifecycle uses the OrderActions routes
    editSchema: validateSingleForm,
    buildUpdateData: () => ({}),
    toDTO: orderToDTO,
    toDTOArray: ordersToDTO,
    toSelect: ordersToSelect,
    selectSchema: orderSelectFormSchema,
    documentFilter: ({company, actionUserCtx}) => ({company: company._id, ...orderPartyFilter(actionUserCtx)}),
    overrideSelectHandler: async (params): Promise<SelectResponse> => {
        const {logger, languageCode, company, name, limit, page, status, forReview, actionUserCtx} = params;
        const opts = {logger, languageCode};

        logger.start("Fetching orders for select...");

        const sanitizedFields = SchemaGuard.sanitizeFields(Order, {name: {}, taskRequest: {keys: {title: {}}}, listing: {keys: {title: {}}}}, "read", actionUserCtx, languageCode);
        const populate = SchemaGuard.generatePopulate(sanitizedFields, Order.schema);

        const conditions: Record<string, unknown>[] = [{company: company._id}, orderPartyFilter(actionUserCtx)];
        if (name?.trim()) {
            conditions.push({name: {$regex: escapeRegex(name.trim()), $options: "i"}});
        }

        if (forReview) {
            // The caller's completed orders that have no live review yet
            const customerId = new ObjectId(actionUserCtx.userId);
            const myCompleted = await orderService.find({company: company._id, customer: customerId, status: "completed"}, opts, null, "_id");
            const reviews = await reviewService.find({company: company._id, order: {$in: myCompleted.map((order) => order._id)}}, opts, null, "order");
            conditions.push({customer: customerId, status: "completed", _id: {$nin: reviews.map((review) => review.order._id)}});
        } else if (status) {
            conditions.push({status});
        }

        const filter = {$and: conditions};
        const [orders, total] = await Promise.all([
            orderService.find(filter, opts, populate.populate, populate.select, {createdAt: -1}, limit, (page - 1) * limit),
            orderService.count(filter, opts),
        ]);

        logger.finish("Finished fetching orders for select!");

        return {data: ordersToSelect(orders), total};
    },
    enrichList: async (docs, params) => {
        const {logger, languageCode, company} = params;
        const orderIds = docs.map((d) => d._id);
        const [submittedIds, activeDisputeIds] = await Promise.all([
            ordersWithSubmittedDelivery(orderIds, company._id, {logger, languageCode}),
            ordersWithActiveDispute(orderIds, company._id, {logger, languageCode}),
        ]);
        return ordersToDTO(docs, submittedIds, activeDisputeIds);
    },
    enrichSingle: async (doc, params) => {
        const {logger, languageCode, company} = params;
        const [submittedIds, activeDisputeIds, deliveries, milestones, revisions, disputes, bookings, reviews] = await Promise.all([
            ordersWithSubmittedDelivery([doc._id], company._id, {logger, languageCode}),
            ordersWithActiveDispute([doc._id], company._id, {logger, languageCode}),
            readOrderChildren(OrderDelivery, "orderdeliveries", orderDeliveryService, doc, params, {createdAt: -1}),
            readOrderChildren(OrderMilestone, "ordermilestones", orderMilestoneService, doc, params, {orderIndex: 1}),
            readOrderChildren(OrderRevision, "orderrevisions", orderRevisionService, doc, params, {createdAt: -1}),
            readOrderChildren(Dispute, "disputes", disputeService, doc, params, {createdAt: -1}),
            readOrderChildren(Booking, "bookings", bookingService, doc, params, {startAt: -1}),
            readOrderChildren(Review, "reviews", reviewService, doc, params, {createdAt: -1}),
        ]);
        return {
            ...orderToDTO(doc, submittedIds.size > 0, activeDisputeIds.size > 0),
            ...(deliveries && {deliveries: orderDeliveriesToDTO(deliveries)}),
            ...(milestones && {milestones: orderMilestonesToDTO(milestones)}),
            ...(revisions && {revisions: orderRevisionsToDTO(revisions)}),
            ...(disputes && {disputes: disputesToDTO(disputes)}),
            ...(bookings && {bookings: bookingsToDTOArray(bookings)}),
            ...(reviews && {reviews: reviewsToDTO(reviews)}),
        };
    },
    /** Admin only, and only once the order is final: an active order still holds escrow. */
    beforeDelete: async (params, doc) => {
        if (!params.actionUserCtx.isAdmin) {
            throw apiValidationException("user_permissions_not_sufficient", null, null, params.languageCode);
        }
        if (doc.status !== "completed" && doc.status !== "cancelled") {
            throw apiValidationException("order_not_final", null, null, params.languageCode);
        }
        await assertCanDelete(Order.modelName, doc._id, params.languageCode, params.session);
    },
    actions: OrderActions,
    rateLimits: {read: 60, write: 30, delete: 20},
});

const BUYER_ORDER_POPULATE = [
    {path: "listing", select: "name title status mainImage"},
    {path: "taskRequest", select: "name title"},
    {path: "provider", select: "name surname photo"},
    {path: "currency", select: "name symbol abbreviation"},
];

/** Per-order flags the storefront account shows: delivery waiting, open dispute, reviewed. */
async function buyerOrderFlags(orderIds: ObjectId[], companyId: ObjectId | undefined, opts: CrudOptions) {
    const reviewFilter: Record<string, unknown> = {order: {$in: orderIds}};
    if (companyId) reviewFilter.company = companyId;
    const [submitted, disputed, reviews] = await Promise.all([
        ordersWithSubmittedDelivery(orderIds, companyId, opts),
        ordersWithActiveDispute(orderIds, companyId, opts),
        reviewService.find(reviewFilter, opts, null, "order"),
    ]);
    const reviewed = new Set(reviews.map((review) => review.order._id.toString()));
    return (order: IOrder) => {
        const id = order._id.toString();
        return orderToBuyerDTO(order, submitted.has(id), disputed.has(id), reviewed.has(id));
    };
}

/**
 * Buyer self-service routes (storefront account pages). Scoped hard to the
 * authenticated customer — no admin model permissions required. In the portal zone they read the buyer's orders
 * from every seller (`portalPurchaseRoute`, D16).
 */
router.post(
    "/my",
    authMW("private"),
    rateLimiter({windowMs: 60000, max: 60}),
    validateFormZod(myServiceOrdersFormSchema),
    asyncHandler(portalPurchaseRoute(async (params: AuthenticatedMWType & MyServiceOrdersFormType) => {
        const {company, actionUserCtx, logger, languageCode, status, origin} = params;
        const page = params.page ?? 1;
        const limit = params.limit ?? 10;
        const opts = {logger, languageCode};
        const platform = isPortalZoneOrigin(origin);

        const filter: Record<string, unknown> = {
            customer: new ObjectId(actionUserCtx.userId),
            ...(status && {status}),
        };
        if (!platform) filter.company = company._id;
        const [orders, total] = await Promise.all([
            orderService.find(filter, opts, BUYER_ORDER_POPULATE, undefined, {createdAt: -1}, limit, (page - 1) * limit),
            orderService.count(filter, opts),
        ]);
        const toBuyerDTO = await buyerOrderFlags(orders.map((order) => order._id), platform ? undefined : company._id, opts);

        return {data: orders.map(toBuyerDTO), total, page, limit};
    })),
);

router.post(
    "/mySingle",
    authMW("private"),
    rateLimiter({windowMs: 60000, max: 60}),
    validateFormZod(validateSingleForm),
    asyncHandler(portalPurchaseRoute(async (params: AuthenticatedMWType & {_id: string}) => {
        const {company, actionUserCtx, logger, languageCode, _id, origin} = params;
        const opts = {logger, languageCode};
        const platform = isPortalZoneOrigin(origin);

        const filter: Record<string, unknown> = {
            _id: new ObjectId(_id),
            customer: new ObjectId(actionUserCtx.userId),
        };
        if (!platform) filter.company = company._id;

        const order = await orderService.findOne(filter, opts, BUYER_ORDER_POPULATE);
        if (!order) throw apiValidationException("order_not_found", "", null, languageCode);

        const orderCompanyId = order.company._id;
        const providerId = nestedEntityToRef(order.provider);
        const scope = {order: order._id, company: orderCompanyId};
        const [toBuyerDTO, deliveries, milestones, revisions, bookings, unpaidHold, providerAvailability] = await Promise.all([
            buyerOrderFlags([order._id], orderCompanyId, opts),
            orderDeliveryService.find(scope, opts, ["attachments"], undefined, {createdAt: -1}),
            orderMilestoneService.find(scope, opts, ["currency"], undefined, {orderIndex: 1}),
            orderRevisionService.find(scope, opts, undefined, undefined, {createdAt: -1}),
            bookingService.find(scope, opts, undefined, undefined, {startAt: 1}),
            escrowTransactionService.findOne({
                order: order._id,
                company: orderCompanyId,
                type: "hold",
                stripeClientSecret: {$exists: true, $ne: ""},
                gatewayStatus: {$in: ["pending", "ledger_only"]},
            }, {}, undefined, "stripeClientSecret"),
            // The booking form shows when the session can be (D105); a provider whose user is gone has none to show
            providerId ? loadProviderAvailability(providerId, orderCompanyId, opts) : undefined,
        ]);

        const escrowClientSecret = (unpaidHold as {stripeClientSecret?: string} | null)?.stripeClientSecret;

        return {
            data: {
                ...toBuyerDTO(order),
                ...(escrowClientSecret ? {escrowClientSecret} : {}),
                deliveries: orderDeliveriesToDTO(deliveries),
                milestones: orderMilestonesToDTO(milestones),
                revisions: orderRevisionsToDTO(revisions),
                bookings: bookingsToDTOArray(bookings),
                ...(providerAvailability && {providerAvailability}),
            },
        };
    })),
);
