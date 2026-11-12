import {ObjectId} from "mongodb";
import {action} from "@coreModule/api/actionDecorator";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import {extendOrderFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/order/extendOrder.form.validator";
import {submitOrderDeliveryFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/order/submitOrderDelivery.form.validator";
import {createOrderFromListingFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/order/createOrderFromListing.form.validator";
import {requestRevisionFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/order/requestRevision.form.validator";
import type {
    CreateOrderFromListingFormType,
    ExtendOrderFormType,
    RequestRevisionFormType,
    SubmitOrderDeliveryFormType,
} from "armonia/src/modules/marketplace/api/marketplace/private/order/order.schema-def";
import type {
    CreateOrderMilestoneFormType,
    ReleaseOrderMilestoneFormType,
} from "armonia/src/modules/marketplace/api/marketplace/private/orderMilestone/orderMilestone.schema-def";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {mediaService} from "@coreModule/database/schemas/media/media.service";
import {runAfterCommit, type TransactionRequiredParams} from "@coreModule/utilities/middlewares/transactionUtils";
import {orderDeliveryService} from "@marketplaceModule/database/schemas/orderDelivery/orderDelivery.service";
import {orderRevisionService} from "@marketplaceModule/database/schemas/orderRevision/orderRevision.service";
import {disputeService} from "@marketplaceModule/database/schemas/dispute/dispute.service";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {listingPackageService} from "@marketplaceModule/database/schemas/listingPackage/listingPackage.service";
import {listingAddOnService} from "@marketplaceModule/database/schemas/listingAddOn/listingAddOn.service";
import {providerProfileService} from "@marketplaceModule/database/schemas/providerProfile/providerProfile.service";
import {orderService} from "@marketplaceModule/database/schemas/order/order.service";
import type {IOrder} from "@marketplaceModule/database/schemas/order/order";
import {createEscrowHold, createEscrowReleaseAndFee, escrowBalance} from "@financeModule/utilities/escrowHelper";
import {emitNotificationEvent} from "@coreModule/domain/notifications/notificationEventBus";
import {NotificationEventCodes} from "@marketplaceModule/domain/notifications/notificationEventCodes";
import {
    completeSubmittedDeliveryAndRelease,
    refundRemainingEscrow,
} from "@marketplaceModule/database/schemas/order/orderEscrow";
import {asPortalBuyer, isOrderParty} from "@marketplaceModule/utilities/services/marketplaceAccess";
import {listingSeller, milestoneSeller, orderSeller} from "@marketplaceModule/utilities/services/portalBuyerTargets";
import {isPortalZoneOrigin} from "@coreModule/utilities/marketing/portalOrigin";
import {inPortalPurchase} from "@coreModule/utilities/marketing/portalStorefront";
import {orderMilestoneService} from "@marketplaceModule/database/schemas/orderMilestone/orderMilestone.service";
import {createOrderMilestoneFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/orderMilestone/createOrderMilestone.form.validator";
import {releaseOrderMilestoneFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/orderMilestone/releaseOrderMilestone.form.validator";
import type {ActionMessage, SingleForm} from "armonia/src/modules/core/types/shared.types";
import {getMarketplaceEnvConfig} from "@marketplaceModule/utilities/config";
import {minorToNumber, sumMinor, toMinor} from "armonia/src/modules/core/helpers/money";

const DAY_MS = 24 * 60 * 60 * 1000;


/** Queues a marketplace notification to one user for after the transaction commits. */
async function notifyAfterCommit(
    params: TransactionRequiredParams,
    code: string,
    receiverId: string,
    payload: Record<string, unknown>,
): Promise<void> {
    await runAfterCommit(params.session, async () => {
        emitNotificationEvent(code, {
            receiverIds: [receiverId],
            payload: {companyId: params.company._id.toString(), languageCode: params.languageCode, ...payload},
        });
    });
}

async function hasOpenDispute(order: IOrder, params: TransactionRequiredParams): Promise<boolean> {
    const {session, logger, languageCode, company} = params;
    const openDispute = await disputeService.findOne(
        {order: order._id, status: {$in: ["open", "under_review"]}, company: company._id},
        {session, logger, languageCode},
        null,
        "_id",
    );
    return openDispute !== null;
}

export class OrderActions {
    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 20},
        transaction: true,
        schema: createOrderFromListingFormSchema,
        // The caller's own record, or one they are a party to: the party check below decides (D14).
        selfService: true,
        // A portal buyer: the module is checked on the seller (D143).
        portalBuyer: listingSeller,
    })
    async createFromListing(params: Record<string, any>): Promise<ActionMessage & {_id: string}> {
        const p = params as TransactionRequiredParams & CreateOrderFromListingFormType;
        const {logger, languageCode, session, company, actionUserCtx, listing: listingRef, package: packageRef, addOns: addOnRefs, note, origin} = p;
        const opts = {session, logger, languageCode};

        logger.start(`Creating order from listing: ${listingRef}...`);

        const platform = isPortalZoneOrigin(origin ?? "");
        // On the portal the listing's seller owns the order: its listing, packages and add-ons are read there (D16)
        return inPortalPurchase(platform, async () => {
            const listingFilter: Record<string, unknown> = {_id: new ObjectId(listingRef), status: "active"};
            if (!platform) listingFilter.company = company._id;

            const listing = await listingService.findOneOrThrow(listingFilter, opts);
            const orderCompanyId = platform ? listing.company._id : company._id;

            const providerId = listing.provider._id;
            if (providerId.toString() === actionUserCtx.userId) {
                throw apiValidationException("provider_cannot_order_own_listing", null, null, languageCode);
            }

            // Summed in exact minor units so package, add-on and milestone totals do not drift (D35).
            let amountCents = toMinor(listing.price ?? 0);
            let currencyId = listing.priceCurrency?._id;
            let deliveryDays = listing.deliveryDays ?? 1;

            if (packageRef) {
                const pkg = await listingPackageService.findOneOrThrow(
                    {_id: new ObjectId(packageRef), listing: listing._id, company: orderCompanyId},
                    opts,
                );
                amountCents = toMinor(pkg.price.amount);
                currencyId = pkg.price.currency._id;
                deliveryDays = pkg.deliveryDays;
            }

            if (!currencyId) {
                throw apiValidationException("listing_has_no_currency", null, null, languageCode);
            }

            if (addOnRefs?.length) {
                const addOns = await listingAddOnService.find(
                    {_id: {$in: addOnRefs.map((id) => new ObjectId(id))}, listing: listing._id, company: orderCompanyId},
                    opts,
                    null,
                    "_id price deliveryDays",
                );
                if (addOns.length !== new Set(addOnRefs).size) {
                    throw apiValidationException("listing_add_on_not_found", null, null, languageCode);
                }
                for (const addOn of addOns) {
                    if (!addOn.price.currency._id.equals(currencyId)) {
                        throw apiValidationException("add_on_currency_mismatch", null, null, languageCode);
                    }
                    amountCents += toMinor(addOn.price.amount);
                    deliveryDays += addOn.deliveryDays ?? 0;
                }
            }

            const order = await orderService.create(
                {
                    listing: listing._id,
                    customer: new ObjectId(actionUserCtx.userId),
                    provider: providerId,
                    amount: minorToNumber(amountCents),
                    currency: currencyId,
                    status: "pending",
                    company: orderCompanyId,
                    deliveryDueDate: new Date(Date.now() + deliveryDays * DAY_MS),
                    ...(note && {note}),
                },
                {...opts, auditUserId: actionUserCtx.userId},
            );

            await notifyAfterCommit(p, NotificationEventCodes.ORDER_CREATED_FROM_LISTING, providerId.toString(), {
                orderId: order._id.toString(),
                listingId: listing._id.toString(),
                listingTitle: listing.title,
            });

            logger.finish(`Successfully created order from listing: ${listingRef}`);

            return {message: "Order created successfully", _id: order._id.toString()};
        });
    }

    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 30},
        transaction: true,
        schema: validateSingleForm,
    })
    async accept(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & SingleForm;
        const {logger, languageCode, session, company, actionUserCtx, _id} = p;
        const opts = {session, logger, languageCode};

        logger.start(`Accepting order: ${_id}...`);

        const order = await orderService.findOneOrThrow({_id: new ObjectId(_id), company: company._id}, opts);

        if (!isOrderParty(order, actionUserCtx.userId, "provider")) {
            throw apiValidationException("only_provider_can_accept", null, null, languageCode);
        }
        if (order.status !== "pending") {
            throw apiValidationException("order_not_pending", null, null, languageCode);
        }

        await orderService.updateByIdOrThrow(order._id, {$set: {status: "accepted"}}, {...opts, auditUserId: actionUserCtx.userId});

        if (order.amount > 0) {
            await createEscrowHold(order._id, order.amount, order.currency._id, company._id, {...opts, auditUserId: actionUserCtx.userId});
        }

        await notifyAfterCommit(p, NotificationEventCodes.ORDER_ACCEPTED, order.customer._id.toString(), {
            orderId: order._id.toString(),
            orderName: order.name,
        });

        logger.finish(`Successfully accepted order: ${_id}`);

        return {message: "Order accepted successfully"};
    }

    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 30},
        transaction: true,
        schema: validateSingleForm,
    })
    async start(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & SingleForm;
        const {logger, languageCode, session, company, actionUserCtx, _id} = p;
        const opts = {session, logger, languageCode};

        logger.start(`Starting order: ${_id}...`);

        const order = await orderService.findOneOrThrow({_id: new ObjectId(_id), company: company._id}, opts);

        if (!isOrderParty(order, actionUserCtx.userId, "provider")) {
            throw apiValidationException("only_provider_can_start", null, null, languageCode);
        }
        if (order.status !== "accepted") {
            throw apiValidationException("order_must_be_accepted_first", null, null, languageCode);
        }

        await orderService.updateByIdOrThrow(order._id, {$set: {status: "in_progress"}}, {...opts, auditUserId: actionUserCtx.userId});

        await notifyAfterCommit(p, NotificationEventCodes.ORDER_STARTED, order.customer._id.toString(), {
            orderId: order._id.toString(),
            orderName: order.name,
        });

        logger.finish(`Successfully started order: ${_id}`);

        return {message: "Order started successfully"};
    }

    /**
     * The provider may cancel at any time; the customer only before work starts —
     * after that a disagreement goes through a dispute. Whatever is still held is refunded.
     */
    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 30},
        transaction: true,
        schema: validateSingleForm,
        // The caller's own record, or one they are a party to: the party check below decides (D14).
        selfService: true,
        // A portal buyer: the module is checked on the seller (D143).
        portalBuyer: orderSeller("_id"),
    })
    async cancel(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & SingleForm;
        // A buyer's own order bought on the portal is its seller's (D16)
        return asPortalBuyer(p, async () => p._id, async (p) => {
            const {logger, languageCode, session, company, actionUserCtx, _id} = p;
            const opts = {session, logger, languageCode};

            logger.start(`Cancelling order: ${_id}...`);

            const order = await orderService.findOneOrThrow({_id: new ObjectId(_id), company: company._id}, opts);

            const isProvider = isOrderParty(order, actionUserCtx.userId, "provider");
            const isCustomer = isOrderParty(order, actionUserCtx.userId, "customer");
            if (!isProvider && !isCustomer) {
                throw apiValidationException("only_parties_can_cancel", null, null, languageCode);
            }
            if (order.status === "completed" || order.status === "cancelled") {
                throw apiValidationException("order_already_final", null, null, languageCode);
            }
            if (!isProvider && order.status === "in_progress") {
                throw apiValidationException("customer_cannot_cancel_started_order", null, null, languageCode);
            }
            if (await hasOpenDispute(order, p)) {
                throw apiValidationException("cannot_cancel_with_open_dispute", null, null, languageCode);
            }

            await orderService.updateByIdOrThrow(order._id, {$set: {status: "cancelled"}}, {...opts, auditUserId: actionUserCtx.userId});
            await refundRemainingEscrow(order, {...opts, companyId: company._id, auditUserId: actionUserCtx.userId});

            const otherPartyId = isProvider ? order.customer._id : order.provider._id;
            await notifyAfterCommit(p, NotificationEventCodes.ORDER_CANCELLED, otherPartyId.toString(), {
                orderId: order._id.toString(),
                orderName: order.name,
                cancelledBy: isProvider ? "provider" : "customer",
            });

            logger.finish(`Successfully cancelled order: ${_id}`);

            return {message: "Order cancelled successfully"};
        });
    }

    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 10},
        transaction: true,
        schema: extendOrderFormSchema,
    })
    async extend(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & ExtendOrderFormType;
        const {logger, languageCode, session, company, actionUserCtx, _id, additionalDays} = p;
        const opts = {session, logger, languageCode};

        logger.start(`Extending order: ${_id}...`);

        const order = await orderService.findOneOrThrow({_id: new ObjectId(_id), company: company._id}, opts);

        if (!isOrderParty(order, actionUserCtx.userId, "provider")) {
            throw apiValidationException("only_provider_can_extend", null, null, languageCode);
        }
        if (order.status === "completed" || order.status === "cancelled") {
            throw apiValidationException("cannot_extend_final_order", null, null, languageCode);
        }

        const newDue = new Date(order.deliveryDueDate ?? order.createdAt);
        newDue.setDate(newDue.getDate() + additionalDays);

        await orderService.updateByIdOrThrow(order._id, {$set: {deliveryDueDate: newDue}}, {...opts, auditUserId: actionUserCtx.userId});

        await notifyAfterCommit(p, NotificationEventCodes.ORDER_EXTENDED, order.customer._id.toString(), {
            orderId: order._id.toString(),
            orderName: order.name,
            additionalDays,
        });

        logger.finish(`Successfully extended order: ${_id}`);

        return {message: "Order extended successfully"};
    }

    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 20},
        transaction: true,
        schema: submitOrderDeliveryFormSchema,
    })
    async submitDelivery(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & SubmitOrderDeliveryFormType;
        const {logger, languageCode, session, company, actionUserCtx, _id, message, attachments} = p;
        const opts = {session, logger, languageCode};

        logger.start(`Submitting delivery for order: ${_id}...`);

        const order = await orderService.findOneOrThrow({_id: new ObjectId(_id), company: company._id}, opts);

        if (!isOrderParty(order, actionUserCtx.userId, "provider")) {
            throw apiValidationException("only_provider_can_deliver", null, null, languageCode);
        }
        if (order.status !== "in_progress") {
            throw apiValidationException("order_not_in_progress", null, null, languageCode);
        }

        const existingDelivery = await orderDeliveryService.findOne(
            {order: order._id, status: "submitted", company: company._id},
            opts,
            null,
            "_id",
        );
        if (existingDelivery) {
            throw apiValidationException("delivery_already_submitted", null, null, languageCode);
        }

        // The panel uploads files first and sends their media ids
        const attachmentIds = (attachments ?? [])
            .filter((id): id is string => typeof id === "string")
            .map((id) => new ObjectId(id));
        if (attachmentIds.length) {
            const owned = await mediaService.count({_id: {$in: attachmentIds}, company: company._id}, opts);
            if (owned !== attachmentIds.length) {
                throw apiValidationException("delivery_attachment_not_found", null, null, languageCode);
            }
        }

        await orderDeliveryService.create(
            {
                order: order._id,
                company: company._id,
                message: message ?? "",
                attachments: attachmentIds,
                status: "submitted",
            },
            {...opts, auditUserId: actionUserCtx.userId},
        );

        // A new delivery answers the revision the customer asked for
        await orderRevisionService.updateMany(
            {order: order._id, status: "pending", company: company._id},
            {$set: {status: "completed"}},
            {...opts, auditUserId: actionUserCtx.userId},
        );

        await notifyAfterCommit(p, NotificationEventCodes.ORDER_DELIVERY_SUBMITTED, order.customer._id.toString(), {
            orderId: order._id.toString(),
            orderName: order.name,
        });

        logger.finish(`Successfully submitted delivery for order: ${_id}`);

        return {message: "Delivery submitted successfully"};
    }

    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 20},
        transaction: true,
        schema: validateSingleForm,
        // The caller's own record, or one they are a party to: the party check below decides (D14).
        selfService: true,
        // A portal buyer: the module is checked on the seller (D143).
        portalBuyer: orderSeller("_id"),
    })
    async acceptDelivery(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & SingleForm;
        // A buyer's own order bought on the portal is its seller's (D16)
        return asPortalBuyer(p, async () => p._id, async (p) => {
            const {logger, languageCode, session, company, actionUserCtx, _id} = p;
            const opts = {session, logger, languageCode};

            logger.start(`Accepting delivery for order: ${_id}...`);

            const order = await orderService.findOneOrThrow({_id: new ObjectId(_id), company: company._id}, opts);

            if (!isOrderParty(order, actionUserCtx.userId, "customer")) {
                throw apiValidationException("only_customer_can_accept_delivery", null, null, languageCode);
            }
            if (order.status !== "in_progress") {
                throw apiValidationException("order_not_in_progress", null, null, languageCode);
            }
            if (await hasOpenDispute(order, p)) {
                throw apiValidationException("cannot_accept_delivery_with_open_dispute", null, null, languageCode);
            }

            const delivery = await orderDeliveryService.findOne(
                {order: order._id, status: "submitted", company: company._id},
                opts,
                null,
                "_id",
            );
            if (!delivery) {
                throw apiValidationException("no_pending_delivery", null, null, languageCode);
            }

            await completeSubmittedDeliveryAndRelease(order, delivery._id, {
                ...opts,
                companyId: company._id,
                auditUserId: actionUserCtx.userId,
            });

            logger.finish(`Successfully accepted delivery for order: ${_id}`);

            return {message: "Order completed successfully"};
        });
    }

    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 10},
        transaction: true,
        schema: requestRevisionFormSchema,
        // The caller's own record, or one they are a party to: the party check below decides (D14).
        selfService: true,
        // A portal buyer: the module is checked on the seller (D143).
        portalBuyer: orderSeller("_id"),
    })
    async requestRevision(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & RequestRevisionFormType;
        // A buyer's own order bought on the portal is its seller's (D16)
        return asPortalBuyer(p, async () => p._id, async (p) => {
            const {logger, languageCode, session, company, actionUserCtx, _id, reason} = p;
            const opts = {session, logger, languageCode};

            logger.start(`Requesting revision for order: ${_id}...`);

            const order = await orderService.findOneOrThrow({_id: new ObjectId(_id), company: company._id}, opts);

            if (!isOrderParty(order, actionUserCtx.userId, "customer")) {
                throw apiValidationException("only_customer_can_request_revision", null, null, languageCode);
            }
            if (order.status !== "in_progress") {
                throw apiValidationException("order_not_in_progress", null, null, languageCode);
            }

            const delivery = await orderDeliveryService.findOne(
                {order: order._id, status: "submitted", company: company._id},
                opts,
                null,
                "_id",
            );
            if (!delivery) {
                throw apiValidationException("no_pending_delivery", null, null, languageCode);
            }

            const revisionCount = await orderRevisionService.count({order: order._id, company: company._id}, opts);
            if (revisionCount >= getMarketplaceEnvConfig().maxRevisions) {
                throw apiValidationException("max_revisions_reached", null, null, languageCode);
            }

            await orderDeliveryService.updateByIdOrThrow(
                delivery._id,
                {$set: {status: "revision_requested"}},
                {...opts, auditUserId: actionUserCtx.userId},
            );

            await orderRevisionService.create(
                {
                    order: order._id,
                    delivery: delivery._id,
                    company: company._id,
                    requestedBy: new ObjectId(actionUserCtx.userId),
                    reason,
                    status: "pending",
                },
                {...opts, auditUserId: actionUserCtx.userId},
            );

            await notifyAfterCommit(p, NotificationEventCodes.ORDER_REVISION_REQUESTED, order.provider._id.toString(), {
                orderId: order._id.toString(),
                orderName: order.name,
                reason,
            });

            logger.finish(`Successfully requested revision for order: ${_id}`);

            return {message: "Revision requested successfully"};
        });
    }

    /** Milestones split an accepted order's escrow; together they never exceed the order amount. */
    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 30},
        transaction: true,
        schema: createOrderMilestoneFormSchema,
        // The caller's own record, or one they are a party to: the customer check below decides (D14, TD-B190).
        selfService: true,
        // A portal buyer: the module is checked on the seller (D143).
        portalBuyer: orderSeller("order"),
    })
    async createMilestone(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & CreateOrderMilestoneFormType;
        // A buyer's own order bought on the portal is its seller's (D16)
        return asPortalBuyer(p, async () => p.order, async (p) => {
            const {logger, languageCode, session, company, actionUserCtx, order: orderRef, name, amount, orderIndex} = p;
            const opts = {session, logger, languageCode};

            logger.start(`Creating milestone for order: ${orderRef}...`);

            const order = await orderService.findOneOrThrow({_id: new ObjectId(orderRef), company: company._id}, opts);

            if (!isOrderParty(order, actionUserCtx.userId, "customer")) {
                throw apiValidationException("only_customer_can_create_milestone", null, null, languageCode);
            }
            if (order.status !== "accepted" && order.status !== "in_progress") {
                throw apiValidationException("milestone_order_not_active", null, null, languageCode);
            }

            const existingMilestones = await orderMilestoneService.find({order: order._id, company: company._id}, opts, null, "amount");
            const existingCents = sumMinor(existingMilestones.map((milestone) => toMinor(milestone.amount)));
            if (existingCents + toMinor(amount) > toMinor(order.amount)) {
                throw apiValidationException("milestone_total_exceeds_order_amount", null, null, languageCode);
            }

            await orderMilestoneService.create(
                {
                    order: order._id,
                    company: company._id,
                    name,
                    amount,
                    currency: order.currency._id,
                    status: "pending",
                    orderIndex: orderIndex ?? existingMilestones.length,
                },
                {...opts, auditUserId: actionUserCtx.userId},
            );

            logger.finish(`Successfully created milestone for order: ${orderRef}`);

            return {message: "Milestone created successfully"};
        });
    }

    /**
     * Releases one milestone out of the escrow balance. The order completes once
     * every milestone is released and nothing is left held; otherwise the rest is
     * released when the customer accepts the delivery.
     */
    @action({
        auth: "private",
        rateLimit: {windowMs: 60000, max: 20},
        transaction: true,
        schema: releaseOrderMilestoneFormSchema,
        // The caller's own record, or one they are a party to: the party check below decides (D14).
        selfService: true,
        // A portal buyer: the module is checked on the seller (D143).
        portalBuyer: milestoneSeller,
    })
    async releaseMilestone(params: Record<string, any>): Promise<ActionMessage> {
        const p = params as TransactionRequiredParams & ReleaseOrderMilestoneFormType;
        // A buyer's own order bought on the portal is its seller's (D16)
        return asPortalBuyer(p, async () => (await orderMilestoneService.findOne({_id: new ObjectId(p.milestone)}, {session: p.session}, null, "order"))?.order, async (p) => {
            const {logger, languageCode, session, company, actionUserCtx, milestone: milestoneRef} = p;
            const opts = {session, logger, languageCode};
            const writeOpts = {...opts, auditUserId: actionUserCtx.userId};

            logger.start(`Releasing milestone: ${milestoneRef}...`);

            const milestone = await orderMilestoneService.findOneOrThrow({_id: new ObjectId(milestoneRef), company: company._id}, opts);
            if (milestone.status !== "pending") {
                throw apiValidationException("milestone_already_released", null, null, languageCode);
            }

            const order = await orderService.findOneOrThrow({_id: milestone.order._id, company: company._id}, opts);

            if (!isOrderParty(order, actionUserCtx.userId, "customer")) {
                throw apiValidationException("only_customer_can_release_milestone", null, null, languageCode);
            }
            if (order.status !== "in_progress") {
                throw apiValidationException("order_must_be_in_progress_to_release", null, null, languageCode);
            }
            if (await hasOpenDispute(order, p)) {
                throw apiValidationException("cannot_release_with_open_dispute", null, null, languageCode);
            }

            const balance = await escrowBalance(order._id, company._id, opts);
            if (toMinor(milestone.amount) > toMinor(balance)) {
                throw apiValidationException("milestone_exceeds_escrow_balance", null, null, languageCode);
            }

            await orderMilestoneService.updateByIdOrThrow(milestone._id, {$set: {status: "released"}}, writeOpts);

            if (milestone.amount > 0) {
                const providerStripeAccountId = await providerProfileService.getPayoutAccountId(order.provider._id, company._id, opts);
                await createEscrowReleaseAndFee(
                    order._id,
                    milestone.amount,
                    order.currency._id,
                    company._id,
                    writeOpts,
                    {providerStripeAccountId, orderMilestoneId: milestone._id},
                );
            }

            const pendingMilestones = await orderMilestoneService.count({order: order._id, company: company._id, status: "pending"}, opts);
            if (pendingMilestones === 0 && await escrowBalance(order._id, company._id, opts) === 0) {
                await orderService.updateByIdOrThrow(order._id, {$set: {status: "completed"}}, writeOpts);
            }

            await notifyAfterCommit(p, NotificationEventCodes.ORDER_MILESTONE_RELEASED, order.provider._id.toString(), {
                orderId: order._id.toString(),
                orderName: order.name,
                milestoneName: milestone.name,
            });

            logger.finish(`Successfully released milestone: ${milestoneRef}`);

            return {message: "Milestone released successfully"};
        });
    }
}
