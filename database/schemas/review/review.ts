import {Document, model, Schema, SchemaTypes} from "mongoose";
import {IUser} from "@coreModule/database/schemas/user/user";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {IListing} from "@marketplaceModule/database/schemas/listing/listing";
import {IOrder} from "@marketplaceModule/database/schemas/order/order";
import {normalizeSchemaPermissions} from "@coreModule/database/utilities";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";
import {IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields} from "@coreModule/database/types/plugin-fields";
import {addModelData} from "@coreModule/database/collections";
import {validateSchemaDefAgainstMongoose} from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import {ReviewSchemaDef} from "armonia/src/modules/marketplace/api/marketplace/private/review/review.schema-def";
import {SimpleUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {ListingSimpleSnippet} from "@marketplaceModule/database/schemas/listing/listing.snippets";
import {OrderWithTaskOrListingSnippet} from "@marketplaceModule/database/schemas/order/order.snippets";
import {applyReviewIndexes} from "./review.indexes";
import {reviewViews} from "./review.views";

export interface IReview extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    order: IOrder;
    /** Set for listing orders; task-request orders have no listing. */
    listing?: IListing;
    rating: number;
    comment?: string;
    reviewer: IUser;
    company: ICompany;
}

const ReviewSchema = new Schema<IReview>(
    {
        order: {
            type: SchemaTypes.ObjectId,
            ref: "Order",
            required: true,
            refAllowlist: OrderWithTaskOrListingSnippet,
        },
        listing: {
            type: SchemaTypes.ObjectId,
            ref: "Listing",
            refAllowlist: ListingSimpleSnippet,
        },
        rating: {
            type: SchemaTypes.Number,
            required: true,
            min: 1,
            max: 5,
        },
        comment: {
            type: SchemaTypes.String,
            default: "",
            trim: true,
        },
        reviewer: {
            type: SchemaTypes.ObjectId,
            ref: "User",
            required: true,
            refAllowlist: SimpleUserSnippet,
        },
    },
    {
        accessMode: "loose",
    },
);

ownershipPlugin(ReviewSchema);
auditPlugin(ReviewSchema);
softDeletePlugin(ReviewSchema);
lifeCyclePlugin(ReviewSchema);
applyReviewIndexes(ReviewSchema);
const Review = model<IReview>("Review", ReviewSchema);
normalizeSchemaPermissions(Review);
export default Review;

addModelData(Review, reviewViews);
validateSchemaDefAgainstMongoose(ReviewSchema, ReviewSchemaDef, "Review", ["listing", "reviewer"]);
