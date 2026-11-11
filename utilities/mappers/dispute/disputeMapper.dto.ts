import type {IDispute} from "@marketplaceModule/database/schemas/dispute/dispute";
import type {Dispute} from "armonia/src/modules/marketplace/api/marketplace/private/dispute/dispute.dto";
import type {SimpleUser} from "armonia/src/modules/core/dto/user.dto";
import type {OrderWithTaskOrListing} from "armonia/src/modules/marketplace/dto/order.dto";
import {SimpleUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {OrderWithTaskOrListingSnippet} from "@marketplaceModule/database/schemas/order/order.snippets";
import {mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {mapOwnershipToDTO, mapSoftDeleteToDTO, mapLifeCycleToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";

export function disputeToDTO(dispute: IDispute): Dispute {
    return {
        _id: dispute._id.toString(),
        order: mapSnippet<OrderWithTaskOrListing>()(dispute.order, OrderWithTaskOrListingSnippet),
        initiator: mapSnippet<SimpleUser>()(dispute.initiator, SimpleUserSnippet),
        reason: dispute.reason,
        status: dispute.status,
        resolution: dispute.resolution,
        ...mapOwnershipToDTO(dispute),
        ...mapSoftDeleteToDTO(dispute),
        ...mapLifeCycleToDTO(dispute),
    };
}

export function disputesToDTO(disputes: IDispute[]): Dispute[] {
    return disputes.map(disputeToDTO);
}
