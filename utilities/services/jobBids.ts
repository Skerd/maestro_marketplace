import type {ObjectId} from "mongodb";
import type {ClientSession} from "mongoose";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import type {serverLogger} from "@coreModule/loggers/serverLog";
import type {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import {bidService} from "@marketplaceModule/database/schemas/bid/bid.service";

export type JobBidInput = {
    bidder: ObjectId;
    /** The bidder's own company when it is not the job's (a quote from a lead, D143). */
    bidderCompany?: ObjectId;
    amount: number;
    proposal: string;
    deliveryDays: number;
};

/**
 * A bid on a job (BE-02: the one transition behind the panel's bid form and a lead's quote). The job must be open
 * and unexpired, not the bidder's own, and the bidder may have one pending bid on it. The bid is the job's company's
 * record, in the job's currency; the caller runs this in that company's tenant.
 */
export async function jobBidData(
    taskRequest: ITaskRequest,
    input: JobBidInput,
    ctx: {session?: ClientSession | null; logger: serverLogger; languageCode: string},
) {
    const {languageCode} = ctx;
    const opts = {session: ctx.session ?? undefined, logger: ctx.logger, languageCode};
    if (taskRequest.status !== "open" || taskRequest.expiresAt <= new Date()) {
        throw apiValidationException("task_request_not_open", null, null, languageCode);
    }
    if (nestedEntityToRef(taskRequest.requester)?.equals(input.bidder)) {
        throw apiValidationException("cannot_bid_on_own_task_request", null, null, languageCode);
    }
    const company = nestedEntityToRef(taskRequest.company);
    const existing = await bidService.findOne({taskRequest: taskRequest._id, bidder: input.bidder, status: "pending", company}, opts, null, "_id");
    if (existing) throw apiValidationException("bid_already_submitted", null, null, languageCode);

    return {
        taskRequest: taskRequest._id,
        bidder: input.bidder,
        ...(input.bidderCompany ? {bidderCompany: input.bidderCompany} : {}),
        amount: input.amount,
        currency: nestedEntityToRef(taskRequest.currency),
        proposal: input.proposal,
        deliveryDays: input.deliveryDays,
    };
}
