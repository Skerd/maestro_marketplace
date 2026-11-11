import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";
import type {IBooking} from "@marketplaceModule/database/schemas/booking/booking";

export function bookingToSelect(booking: IBooking): ApiSelectDatum {
    return {value: booking._id.toString(), label: booking.startAt.toISOString()};
}

export function bookingsToSelect(bookings: IBooking[]): ApiSelectDatum[] {
    return bookings.map(bookingToSelect);
}
