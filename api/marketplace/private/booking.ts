import {ObjectId} from "mongodb";
import {createCrudRouter, type CrudCreateParams} from "@coreModule/api/crudRouterFactory";
import {orderSeller} from "@marketplaceModule/utilities/services/portalBuyerTargets";
import authMW from "@coreModule/utilities/middlewares/authMW";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import {transactionHandler} from "@coreModule/utilities/middlewares/transactionHandler";
import {validateFormZod} from "@coreModule/utilities/middlewares/validateFormZod";
import {assertCanDelete} from "@coreModule/database/relationsRegistry";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {createBookingFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/booking/createBooking.form.validator";
import {editBookingFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/booking/editBooking.form.validator";
import {bookingListFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/booking/bookingList.form.validator";
import type {BookingWhen} from "armonia/src/modules/marketplace/api/marketplace/private/booking/booking.constants";
import {companyTodayOf, companyTimeZoneOf} from "@coreModule/utilities/time/companyTimeZone";
import {localDayInterval} from "@coreModule/utilities/time/timeWindows";
import type {
    CreateBookingFormType,
    EditBookingFormType,
} from "armonia/src/modules/marketplace/api/marketplace/private/booking/booking.schema-def";
import Booking, {type IBooking} from "@marketplaceModule/database/schemas/booking/booking";
import {bookingService} from "@marketplaceModule/database/schemas/booking/booking.service";
import {orderService} from "@marketplaceModule/database/schemas/order/order.service";
import {bookingToDTO, bookingsToDTOArray} from "@marketplaceModule/utilities/mappers/booking/bookingMapper.dto";
import {bookingsToSelect} from "@marketplaceModule/utilities/mappers/booking/bookingMapper.select";
import {restoreUnlessKeyTaken} from "@coreModule/api/restoreUnlessKeyTaken";
import {asPortalBuyer, assertOwnerOrAdmin, isOrderParty, orderChildFilter} from "@marketplaceModule/utilities/services/marketplaceAccess";
import {isWithinProviderAvailability, loadProviderAvailability} from "@marketplaceModule/utilities/services/providerAvailability";

function assertValidBookingRange(startAt: Date, endAt: Date, languageCode: string): void {
    if (endAt <= startAt) {
        throw apiValidationException("invalid_booking_times", null, null, languageCode);
    }
}

/** The "When" quick filter: under way or still to come, on the company's today (GLB-09), or over. */
async function whenFilter(when: BookingWhen | undefined, companyId: ObjectId): Promise<Record<string, unknown>> {
    if (!when) return {};
    const now = new Date();
    if (when === "upcoming") return {endAt: {$gt: now}};
    if (when === "past") return {endAt: {$lte: now}};
    const day = localDayInterval(await companyTodayOf(companyId, {now}), await companyTimeZoneOf(companyId));
    return {startAt: {$gte: day.start, $lt: day.end}};
}

/**
 * A party books an active order once, inside the provider's weekly availability (D105); the provider is taken from
 * the order. The panel PUT and the buyer's `createMine` both run this.
 */
async function buildBookingCreate({order: orderRef, startAt, endAt, timezone, actionUserCtx, company, session, logger, languageCode}: CrudCreateParams<CreateBookingFormType>) {
    const opts = {session, logger, languageCode};
    const order = await orderService.findOneOrThrow({_id: new ObjectId(orderRef), company: company._id}, opts);

    if (!isOrderParty(order, actionUserCtx.userId, "customer") && !isOrderParty(order, actionUserCtx.userId, "provider")) {
        throw apiValidationException("only_order_parties_can_create_booking", null, null, languageCode);
    }
    if (order.status !== "accepted" && order.status !== "in_progress") {
        throw apiValidationException("booking_order_not_active", null, null, languageCode);
    }
    if (await bookingService.findOne({order: order._id, company: company._id}, opts, null, "_id")) {
        throw apiValidationException("order_already_has_booking", null, null, languageCode);
    }

    const startDate = new Date(startAt);
    const endDate = new Date(endAt);
    assertValidBookingRange(startDate, endDate, languageCode);
    const availability = await loadProviderAvailability(order.provider._id, company._id, opts);
    if (!isWithinProviderAvailability(availability, startDate, endDate)) {
        throw apiValidationException("booking_outside_provider_availability", "", null, languageCode, [availability.timeZone]);
    }

    return {
        order: order._id,
        provider: order.provider._id,
        startAt: startDate,
        endAt: endDate,
        // The zone the provider's hours are checked in (their own, else the company's, GLB-09)
        timezone: timezone?.trim() || availability.timeZone,
    };
}

export const basePath = "/api/marketplace/booking";
export const {router} = createCrudRouter<IBooking, CreateBookingFormType, EditBookingFormType>({
    collectionName: "bookings",
    model: Booking,
    service: bookingService,
    entityName: "Booking",
    // Latest first, so what is still to come leads the list; "When" narrows it (UX-12).
    defaultSort: {startAt: -1},
    listSchema: bookingListFormSchema,
    selectProjection: "_id startAt",
    selectSort: {startAt: 1},
    createSchema: createBookingFormSchema,
    editSchema: editBookingFormSchema,
    toDTO: bookingToDTO,
    toDTOArray: bookingsToDTOArray,
    toSelect: bookingsToSelect,
    documentFilter: async ({company, actionUserCtx, logger, languageCode}) => ({
        company: company._id,
        $and: [await orderChildFilter(company._id, actionUserCtx, {logger, languageCode})],
    }),
    extraListFilter: ({company, when}) => whenFilter(when, company._id),
    extraSelectFilter: ({company, actionUserCtx, logger, languageCode}) => orderChildFilter(company._id, actionUserCtx, {logger, languageCode}),
    buildCreateData: buildBookingCreate,
    /** Only the provider (or an admin) reschedules. */
    buildUpdateData: ({startAt, endAt, timezone, actionUserCtx, languageCode, existing}, writeFields) => {
        assertOwnerOrAdmin(existing.provider, actionUserCtx, languageCode);

        const newStart = startAt !== undefined && writeFields.startAt ? new Date(startAt) : undefined;
        const newEnd = endAt !== undefined && writeFields.endAt ? new Date(endAt) : undefined;
        assertValidBookingRange(newStart ?? existing.startAt, newEnd ?? existing.endAt, languageCode);

        return {
            ...(newStart && {startAt: newStart}),
            ...(newEnd && {endAt: newEnd}),
            ...(timezone !== undefined && writeFields.timezone && {timezone}),
        };
    },
    overrideRestoreHandler: restoreUnlessKeyTaken({
        model: Booking,
        service: bookingService,
        entityName: "Booking",
        keys: ["order"],
        errorCode: "order_already_has_booking",
    }),
    beforeDelete: async (params, doc) => {
        assertOwnerOrAdmin(doc.provider, params.actionUserCtx, params.languageCode);
        await assertCanDelete(Booking.modelName, doc._id, params.languageCode, params.session);
    },
    rateLimits: {read: 60, write: 30, delete: 20},
});

/** Buyer self-service create (storefront account): the same rules as PUT, without the model permission. */
router.put(
    "/createMine",
    authMW("private", {portalBuyer: orderSeller("order")}),
    rateLimiter({windowMs: 60000, max: 30}),
    transactionHandler(),
    validateFormZod(createBookingFormSchema),
    // A buyer's own order bought on the portal is its seller's (D16)
    asyncHandler(async (request: CrudCreateParams<CreateBookingFormType>) => asPortalBuyer(request, async () => request.order, async (params) => {
        const {company, actionUserCtx, session, logger, languageCode} = params;
        const created = await bookingService.create(
            {...await buildBookingCreate(params), company: company._id},
            {session, logger, languageCode, auditUserId: actionUserCtx.userId},
        );
        return {data: {_id: created._id.toString()}};
    })),
);
