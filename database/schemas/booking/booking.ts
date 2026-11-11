import { Document, model, Schema, SchemaTypes } from "mongoose";
import { IOrder } from "@marketplaceModule/database/schemas/order/order";
import { ICompany } from "@coreModule/database/schemas/company/company";
import { IUser } from "@coreModule/database/schemas/user/user";
import { normalizeSchemaPermissions } from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import {IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields} from "@coreModule/database/types/plugin-fields";
import { addModelData } from "@coreModule/database/collections";
import { COLUMN_TYPE } from "armonia/src/modules/core/database/filter/typeOperators";
import { SimpleUserSnippet } from "@coreModule/database/schemas/user/user.snippets";
import { OrderSimpleSnippet } from "@marketplaceModule/database/schemas/order/order.snippets";
import { validateSchemaDefAgainstMongoose } from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import { BookingSchemaDef } from "armonia/src/modules/marketplace/api/marketplace/private/booking/booking.schema-def";
import { applyBookingIndexes } from "./booking.indexes";
import { bookingViews } from "./booking.views";

export interface IBooking extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    order: IOrder;
    provider: IUser;
    startAt: Date;
    endAt: Date;
    timezone: string;
}

const BookingSchema = new Schema<IBooking>(
    {
        order: {
            type: SchemaTypes.ObjectId,
            ref: "Order",
            required: true,
            refAllowlist: OrderSimpleSnippet,
        },
        provider: {
            type: SchemaTypes.ObjectId,
            ref: "User",
            required: true,
            refAllowlist: SimpleUserSnippet,
        },
        startAt: {
            type: SchemaTypes.Date,
            required: true,
            dynamicTableConfiguration: {cellType: COLUMN_TYPE.DATETIME},
        },
        endAt: {
            type: SchemaTypes.Date,
            required: true,
            dynamicTableConfiguration: {cellType: COLUMN_TYPE.DATETIME},
        },
        timezone: {
            type: SchemaTypes.String,
            // The provider's zone at booking time (set by the create route), not a typed value.
            required: true,
            trim: true,
            dynamicTableConfiguration: {hideColumn: true},
        },
    },
    {
        accessMode: "loose",
    }
);

ownershipPlugin(BookingSchema);
auditPlugin(BookingSchema);
softDeletePlugin(BookingSchema);
lifeCyclePlugin(BookingSchema);
applyBookingIndexes(BookingSchema);
const Booking = model<IBooking>("Booking", BookingSchema);
normalizeSchemaPermissions(Booking);
export default Booking;

addModelData(Booking, bookingViews);
validateSchemaDefAgainstMongoose(BookingSchema, BookingSchemaDef, "Booking", ["provider"]);
