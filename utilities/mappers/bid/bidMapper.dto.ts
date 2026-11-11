import type {IBid} from "@marketplaceModule/database/schemas/bid/bid";
import type {Bid} from "armonia/src/modules/marketplace/api/marketplace/private/bid/bid.dto";
import type {CurrencySimple} from "armonia/src/modules/core/dto/currency.dto";
import type {SimpleUser} from "armonia/src/modules/core/dto/user.dto";
import type {TaskRequestSimple} from "armonia/src/modules/marketplace/dto/taskRequest.dto";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {SimpleUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {TaskRequestSimpleSnippet} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.snippets";
import {mapOwnershipToDTO, mapSoftDeleteToDTO, mapLifeCycleToDTO} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";
import {mapSnippet} from "@coreModule/utilities/mappers/common.mapper";

export function bidToDTO(bid: IBid): Bid {
    return {
        _id: bid._id.toString(),
        name: bid.name,
        taskRequest: mapSnippet<TaskRequestSimple>()(bid.taskRequest, TaskRequestSimpleSnippet),
        bidder: mapSnippet<SimpleUser>()(bid.bidder, SimpleUserSnippet),
        amount: bid.amount,
        currency: mapSnippet<CurrencySimple>()(bid.currency, CurrencySimpleSnippet),
        proposal: bid.proposal,
        deliveryDays: bid.deliveryDays,
        status: bid.status,
        ...mapOwnershipToDTO(bid),
        ...mapSoftDeleteToDTO(bid),
        ...mapLifeCycleToDTO(bid),
    };
}

export function bidsToDTOArray(bids: IBid[]): Bid[] {
    return bids.map(bidToDTO);
}
