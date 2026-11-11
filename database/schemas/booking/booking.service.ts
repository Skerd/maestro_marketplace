/**
 * Booking Service
 *
 * CRUD service for Booking model.
 */

import { BaseCrudService } from "@coreModule/database/services/baseCrudService";
import Booking, {IBooking} from "./booking";

export class BookingService extends BaseCrudService<IBooking, typeof Booking> {
    constructor() {
        super(Booking, "Booking");
    }
}

export const bookingService = new BookingService();
