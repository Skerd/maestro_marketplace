import type {IReview} from "@marketplaceModule/database/schemas/review/review";
import type {Review} from "armonia/src/modules/marketplace/api/marketplace/private/review/review.dto";
import type {SimpleUser} from "armonia/src/modules/core/dto/user.dto";
import type {ListingSimple} from "armonia/src/modules/marketplace/dto/listing.dto";
import type {OrderWithTaskOrListing} from "armonia/src/modules/marketplace/dto/order.dto";
import {SimpleUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {ListingSimpleSnippet} from "@marketplaceModule/database/schemas/listing/listing.snippets";
import {OrderWithTaskOrListingSnippet} from "@marketplaceModule/database/schemas/order/order.snippets";
import {mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {mapOwnershipToDTO, mapSoftDeleteToDTO, mapLifeCycleToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";

export function reviewToDTO(review: IReview): Review {
    return {
        _id: review._id.toString(),
        order: mapSnippet<OrderWithTaskOrListing>()(review.order, OrderWithTaskOrListingSnippet),
        listing: mapSnippet<ListingSimple>()(review.listing, ListingSimpleSnippet),
        rating: review.rating,
        comment: review.comment,
        reviewer: mapSnippet<SimpleUser>()(review.reviewer, SimpleUserSnippet),
        ...mapOwnershipToDTO(review),
        ...mapSoftDeleteToDTO(review),
        ...mapLifeCycleToDTO(review),
    };
}

export function reviewsToDTO(reviews: IReview[]): Review[] {
    return reviews.map(reviewToDTO);
}
