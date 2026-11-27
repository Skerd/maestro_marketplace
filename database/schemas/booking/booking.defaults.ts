import dayjs from "dayjs";
import type {HydratedDocument} from "mongoose";
import Booking, {type IBooking} from "./booking";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {IUser} from "@coreModule/database/schemas/user/user";
import {demoSeedTag} from "@coreModule/database/demo/demoSeed";
import type {CreateOrdersResult} from "@marketplaceModule/database/schemas/order/order.defaults";

export type BookingSeed = {
    seedKey: string;
    orderSeedKey: string;
    /** Days from now when the booking starts (negative = in the past). */
    startInDays: number;
    /** Session length in hours. */
    durationHours: number;
    /** Hour of day (0–23) for deterministic upsert. */
    startHour: number;
    timezone: string;
};

export const defaultBookingSeeds: readonly BookingSeed[] = [
    {
        seedKey: "booking-01-renovation-survey",
        orderSeedKey: "order-01-renovation-completed",
        startInDays: -60,
        durationHours: 2,
        startHour: 9,
        timezone: "Europe/Tirane",
    },
    {
        seedKey: "booking-02-bathroom-visit",
        orderSeedKey: "order-02-bathroom-pending",
        startInDays: 2,
        durationHours: 1,
        startHour: 10,
        timezone: "Europe/Tirane",
    },
    {
        seedKey: "booking-03-bathroom-check",
        orderSeedKey: "order-03-bathroom-task-in-progress",
        startInDays: 1,
        durationHours: 1,
        startHour: 16,
        timezone: "Europe/Tirane",
    },
    {
        seedKey: "booking-04-shell-inspection",
        orderSeedKey: "order-04-shell-completed",
        startInDays: -30,
        durationHours: 2,
        startHour: 8,
        timezone: "Europe/Tirane",
    },
    {
        seedKey: "booking-05-tiling-start",
        orderSeedKey: "order-05-tiling-accepted",
        startInDays: 3,
        durationHours: 8,
        startHour: 8,
        timezone: "Europe/Tirane",
    },
    {
        seedKey: "booking-06-plaster-visit",
        orderSeedKey: "order-06-plastering-cancelled",
        startInDays: -3,
        durationHours: 1,
        startHour: 15,
        timezone: "Europe/Tirane",
    },
    {
        seedKey: "booking-07-masonry-day",
        orderSeedKey: "order-07-masonry-in-progress",
        startInDays: 0,
        durationHours: 8,
        startHour: 8,
        timezone: "Europe/Tirane",
    },
    {
        seedKey: "booking-08-roof-visit",
        orderSeedKey: "order-08-roof-pending",
        startInDays: 5,
        durationHours: 2,
        startHour: 10,
        timezone: "Europe/Tirane",
    },
    {
        seedKey: "booking-09-waterproofing-test",
        orderSeedKey: "order-09-waterproofing-completed",
        startInDays: -20,
        durationHours: 2,
        startHour: 11,
        timezone: "Europe/Tirane",
    },
    {
        seedKey: "booking-10-facade-colours",
        orderSeedKey: "order-10-facade-accepted",
        startInDays: 4,
        durationHours: 1,
        startHour: 17,
        timezone: "Europe/Tirane",
    },
];

export type CreateBookingsResult = {
    bookings: HydratedDocument<IBooking>[];
    bySeedKey: Record<string, HydratedDocument<IBooking>>;
};

function resolveBookingWindow(seed: BookingSeed): {startAt: Date; endAt: Date} {
    const startAt = dayjs()
        .add(seed.startInDays, "day")
        .hour(seed.startHour)
        .minute(0)
        .second(0)
        .millisecond(0)
        .toDate();
    const endAt = dayjs(startAt).add(seed.durationHours, "hour").toDate();
    return {startAt, endAt};
}

export async function createBookings(
    parentLogger: serverLogger,
    company: ICompany,
    provider: IUser,
    orders: CreateOrdersResult,
): Promise<CreateBookingsResult> {
    const logger = getLogger("mongoDbInitialization-createBookings", parentLogger);
    logger.start("Creating bookings...");

    const bookings: HydratedDocument<IBooking>[] = [];
    const bySeedKey: Record<string, HydratedDocument<IBooking>> = {};

    try {
        for (const seed of defaultBookingSeeds) {
            const order = orders.bySeedKey[seed.orderSeedKey];
            if (!order) {
                logger.warn(`Skipping booking "${seed.seedKey}": order "${seed.orderSeedKey}" not found`);
                continue;
            }

            const {startAt, endAt} = resolveBookingWindow(seed);
            const seedTag = demoSeedTag(seed.seedKey);

            // Keyed on {company, order} only — `startAt` is relative to the run date, so
            // including it would miss on a later day and collide with the unique index
            // on `order`, which already allows just one booking per order.
            let existing = await Booking.findOne({
                company: company._id,
                order: order._id,
            });

            const payload = {
                order: order._id,
                provider: provider._id,
                company: company._id,
                startAt,
                endAt,
                timezone: seed.timezone,
                createdBy: provider._id,
            };

            if (!existing) {
                existing = await Booking.create(payload);
                logger.debug(`Successfully created booking '${seed.seedKey}' (${seedTag})`);
            } else {
                existing.set(payload);
                await existing.save();
                logger.debug(`Booking '${seed.seedKey}' (${seedTag}) already exists; updated fields`);
            }

            bookings.push(existing);
            bySeedKey[seed.seedKey] = existing;
        }

        logger.finish("Finished creating bookings!", defaultBookingSeeds.length);
        return {bookings, bySeedKey};
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        logger.err(`Error creating bookings: ${message}`);
        logger.fail("Failed to create bookings!");
        return {bookings: [], bySeedKey: {}};
    }
}
