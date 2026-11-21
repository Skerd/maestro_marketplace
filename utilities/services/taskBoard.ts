import {ObjectId} from "mongodb";
import type {ClientSession} from "mongoose";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import type {TaskBoardPortalOption, TaskBoardTask} from "armonia/src/modules/marketplace/api/marketplace/private/taskBoard/taskBoard.types";
import {allowForeignReferences, asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {portalListedCompanyIds} from "@coreModule/utilities/marketing/portalCompanies";
import {mediaService} from "@coreModule/database/schemas/media/media.service";
import type {serverLogger} from "@coreModule/loggers/serverLog";
import type {UserContext} from "@coreModule/utilities/types/types";
import type {IUser} from "@coreModule/database/schemas/user/user";
import type {ICompany} from "@coreModule/database/schemas/company/company";
import {memberCompaniesFor} from "@coreModule/utilities/security/memberCompany";
import TaskLead from "@marketplaceModule/database/schemas/taskLead/taskLead";
import type {ITaskLead} from "@marketplaceModule/database/schemas/taskLead/taskLead";
import type {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import {taskLeadService} from "@marketplaceModule/database/schemas/taskLead/taskLead.service";
import {taskRequestService} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.service";
import {bidService} from "@marketplaceModule/database/schemas/bid/bid.service";
import {taskLeadQuoteToDTO} from "@marketplaceModule/utilities/mappers/taskLead/taskLeadMapper.dto";
import {findMarketplaceOperatorId} from "@marketplaceModule/utilities/services/marketplaceOperator";
import {JOB_POPULATE, JOB_SELECT, leadVisibilityFilter} from "@marketplaceModule/utilities/services/taskLeads";
import {openPublicTaskFilter, publicTaskClause, taskQuoteStats, toPublicTask, type TaskBoardQuery} from "@marketplaceModule/utilities/services/publicTasks";

type Ctx = {logger: serverLogger; languageCode: string; session?: ClientSession | null};

const BOARD_REASON = "the task board shows the operator's public tasks to every services company (D172)";
const LEAD_REFERENCE = {reason: "a lead in the provider's company points at the job in the marketplace operator", fields: ["TaskLead.taskRequest"]} as const;

/**
 * Who may quote from the task board (D172): any company with the marketplace module that the portal may show (active,
 * not hidden by the platform owner), whatever its listings, except the operator, which sells nothing (D143).
 */
export async function assertTaskBoardBidder(companyId: ObjectId, languageCode: string): Promise<void> {
    if (!(await isTaskBoardBidder(companyId))) throw apiValidationException("task_board_bidder_not_allowed", "", null, languageCode);
}

/** Whether a company may quote from the task board (see `assertTaskBoardBidder`). */
export async function isTaskBoardBidder(companyId: ObjectId): Promise<boolean> {
    const [eligible, operatorId] = await Promise.all([
        asCrossTenant(BOARD_REASON, () => portalListedCompanyIds("marketplace", {}, {companyId})),
        findMarketplaceOperatorId(),
    ]);
    return eligible.length > 0 && !!operatorId && !operatorId.equals(companyId);
}

/**
 * The signed-in portal user's companies that may quote on a public task (D172), each with its live quote on it: their
 * memberships whose role grants the board quote (`memberCompaniesFor`), that may quote from the board.
 */
export async function portalQuoteOptions(task: ITaskRequest, user: IUser, sessionCompany: ObjectId, ctx: Ctx): Promise<TaskBoardPortalOption[]> {
    const companies = await memberCompaniesFor(user, sessionCompany, {model: TaskLead, method: "quoteJob"}, "marketplace", ctx.languageCode);
    const bidders = (await Promise.all(companies.map(async (company) => (await isTaskBoardBidder(company._id)) ? company : null)))
        .filter((company): company is ICompany => !!company);
    if (!bidders.length) return [];
    const bids = await asCrossTenant(BOARD_REASON, () => bidService.find(
        {taskRequest: task._id, bidderCompany: {$in: bidders.map((company) => company._id)}, status: {$in: ["pending", "accepted"]}},
        {logger: ctx.logger, languageCode: ctx.languageCode, withDeleted: false},
        ["currency"],
    ));
    return bidders.map((company) => {
        const bid = bids.find((row) => nestedEntityToRef(row.bidderCompany)?.equals(company._id));
        return {company: {_id: company._id.toString(), name: company.name}, ...(bid ? {quote: taskLeadQuoteToDTO(bid)} : {})};
    });
}

/** A task of the public board (D172), read in the operator; a task posted on a provider's own site is not one. */
export async function loadPublicTask(id: string, ctx: Ctx): Promise<ITaskRequest> {
    const operatorId = await findMarketplaceOperatorId();
    const task = operatorId ? await asCrossTenant(BOARD_REASON, () => taskRequestService.findOne(
        {_id: new ObjectId(id), ...publicTaskClause(operatorId)},
        {session: ctx.session ?? undefined, logger: ctx.logger, languageCode: ctx.languageCode},
    )) : null;
    if (!task) throw apiValidationException("task_request_not_found", "", null, ctx.languageCode);
    return task;
}

/** One live quote per company on a task (D172): the buyer compares companies, not their staff. */
export async function assertNoCompanyQuote(taskId: ObjectId, companyId: ObjectId, ctx: Ctx): Promise<void> {
    const existing = await asCrossTenant(BOARD_REASON, () => bidService.findOne(
        {taskRequest: taskId, bidderCompany: companyId, status: "pending"},
        {session: ctx.session ?? undefined, languageCode: ctx.languageCode},
        null,
        "_id",
    ));
    if (existing) throw apiValidationException("bid_already_submitted", null, null, ctx.languageCode);
}

/**
 * The caller's lead on a task: the one the matching gave them, else a new board lead (D172) in their company, which
 * shares the task's photos with it as the matching does.
 */
export async function boardLeadFor(task: ITaskRequest, companyId: ObjectId, caller: UserContext, ctx: Ctx): Promise<ITaskLead> {
    const opts = {session: ctx.session ?? undefined, logger: ctx.logger, languageCode: ctx.languageCode};
    const provider = new ObjectId(caller.userId);
    const existing = await taskLeadService.findOne({company: companyId, taskRequest: task._id, provider}, opts);
    if (existing) return existing;

    const lead = await allowForeignReferences(LEAD_REFERENCE, () => taskLeadService.create(
        {company: companyId, taskRequest: task._id, provider, origin: "board", status: "viewed", createdBy: provider},
        {...opts, auditUserId: caller.userId},
    ));
    const media = [task.mainImage, ...(task.imageGallery ?? []), ...(task.videoGallery ?? [])]
        .map((ref) => nestedEntityToRef(ref))
        .filter((id): id is ObjectId => !!id);
    if (media.length) {
        await asCrossTenant("a lead's company sees the job's photos", () =>
            mediaService.updateMany({_id: {$in: media}}, {$addToSet: {sharedWithCompanies: companyId}}, {session: opts.session}));
    }
    return lead;
}

/** The tasks as the panel's board shows them: public (D172), with the caller's own lead and quote on each. */
async function toBoardTasks(tasks: ITaskRequest[], companyId: ObjectId, caller: UserContext, ctx: Ctx): Promise<TaskBoardTask[]> {
    const opts = {logger: ctx.logger, languageCode: ctx.languageCode};
    const [stats, leads] = await Promise.all([
        taskQuoteStats(tasks, opts),
        taskLeadService.find({...leadVisibilityFilter(companyId, caller), taskRequest: {$in: tasks.map((task) => task._id)}}, opts, null, "taskRequest status bid provider"),
    ]);
    // A caller who has their own lead sees that one; an admin also sees a colleague's.
    const ownFirst = [...leads].sort((left, right) =>
        Number(nestedEntityToRef(right.provider)?.toString() === caller.userId) - Number(nestedEntityToRef(left.provider)?.toString() === caller.userId));
    const leadByTask = new Map<string, ITaskLead>();
    for (const lead of ownFirst) {
        const taskId = nestedEntityToRef(lead.taskRequest)?.toString();
        if (taskId && !leadByTask.has(taskId)) leadByTask.set(taskId, lead);
    }
    const bidIds = [...leadByTask.values()].map((lead) => nestedEntityToRef(lead.bid)).filter((id): id is ObjectId => !!id);
    const bids = bidIds.length ? await asCrossTenant(BOARD_REASON, () => bidService.find({_id: {$in: bidIds}}, opts, ["currency"])) : [];
    const bidById = new Map(bids.map((bid) => [bid._id.toString(), bid]));

    return tasks.map((task) => {
        const lead = leadByTask.get(task._id.toString());
        const bid = lead ? bidById.get(nestedEntityToRef(lead.bid)?.toString() ?? "") : undefined;
        return {
            ...toPublicTask(task, stats.get(task._id.toString()) ?? {count: 0}),
            ...(lead ? {myLead: {_id: lead._id.toString(), status: lead.status, ...(bid ? {bid: taskLeadQuoteToDTO(bid)} : {})}} : {}),
        };
    });
}

/** A page of the open public tasks for the panel's board, newest first (D172). */
export async function taskBoardPage(
    query: TaskBoardQuery & {offset?: number; limit?: number},
    companyId: ObjectId,
    caller: UserContext,
    ctx: Ctx,
): Promise<{data: TaskBoardTask[]; total: number}> {
    const operatorId = await findMarketplaceOperatorId();
    const filter = operatorId ? await openPublicTaskFilter(operatorId, query) : null;
    if (!filter) return {data: [], total: 0};
    const opts = {logger: ctx.logger, languageCode: ctx.languageCode, withDeleted: false as const};
    const [tasks, total] = await asCrossTenant(BOARD_REASON, () => Promise.all([
        taskRequestService.find(filter, opts, JOB_POPULATE, JOB_SELECT, {createdAt: -1}, query.limit ?? 20, query.offset ?? 0),
        taskRequestService.count(filter, opts),
    ]));
    return {data: await toBoardTasks(tasks, companyId, caller, ctx), total};
}

/** One task of the board, open or not, as the panel shows it (D172). */
export async function taskBoardSingle(id: string, companyId: ObjectId, caller: UserContext, ctx: Ctx): Promise<TaskBoardTask> {
    const operatorId = await findMarketplaceOperatorId();
    const task = operatorId ? await asCrossTenant(BOARD_REASON, () => taskRequestService.findOne(
        {_id: new ObjectId(id), ...publicTaskClause(operatorId)},
        {logger: ctx.logger, languageCode: ctx.languageCode},
        JOB_POPULATE,
        JOB_SELECT,
    )) : null;
    if (!task) throw apiValidationException("task_request_not_found", "", null, ctx.languageCode);
    return (await toBoardTasks([task], companyId, caller, ctx))[0];
}
