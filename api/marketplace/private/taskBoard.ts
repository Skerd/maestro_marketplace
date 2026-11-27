import {Router} from "express";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import authMW, {type AuthenticatedMWType} from "@coreModule/utilities/middlewares/authMW";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import {validateFormZod} from "@coreModule/utilities/middlewares/validateFormZod";
import {actionPermissionMW} from "@coreModule/utilities/security/actionPermissions";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import type {SingleForm} from "armonia/src/modules/core/types/shared.types";
import {
    taskBoardFormSchema,
    type TaskBoardFormType,
} from "armonia/src/modules/marketplace/api/marketplace/private/taskBoard/taskBoard.form.validator";
import type {TaskBoardPortalOptionsResponse, TaskBoardResponse, TaskBoardSingleResponse} from "armonia/src/modules/marketplace/api/marketplace/private/taskBoard/taskBoard.types";
import TaskLead from "@marketplaceModule/database/schemas/taskLead/taskLead";
import {loadPublicTask, portalQuoteOptions, taskBoardPage, taskBoardSingle} from "@marketplaceModule/utilities/services/taskBoard";
import {platformCompany} from "@marketplaceModule/utilities/services/portalBuyerTargets";

/**
 * The task board in the panel (D172): the open public tasks any services company may quote on, newest first, each with
 * the caller's own lead and quote. For those who may quote from it (`taskleads[action:quoteJob]`); the quote itself is
 * `POST /api/marketplace/taskLead/quoteJob`.
 * - POST ""               — a page of tasks, narrowed by words, category and on-site/online
 * - POST "/single"        — one task, open or not
 * - POST "/portalOptions" — on the portal task page: the signed-in user's companies that may quote on it, with their
 *   quote (D172); the portal then quotes through `taskLead/quoteJob` with `actAs`
 */
export const basePath = "/api/marketplace/taskBoard";
export const router = Router();

router.post(
    "",
    authMW("private"),
    actionPermissionMW(TaskLead, "quoteJob"),
    rateLimiter({windowMs: 60000, max: 60}),
    validateFormZod(taskBoardFormSchema),
    asyncHandler(async (params: AuthenticatedMWType & TaskBoardFormType): Promise<TaskBoardResponse> => {
        const {company, actionUserCtx, logger, languageCode, search, category, delivery, offset, limit} = params;
        return taskBoardPage({search, categoryId: category, delivery, offset, limit}, company._id, actionUserCtx, {logger, languageCode});
    }),
);

router.post(
    "/single",
    authMW("private"),
    actionPermissionMW(TaskLead, "quoteJob"),
    rateLimiter({windowMs: 60000, max: 60}),
    validateFormZod(validateSingleForm),
    asyncHandler(async (params: AuthenticatedMWType & SingleForm): Promise<TaskBoardSingleResponse> => {
        const {company, actionUserCtx, logger, languageCode, _id} = params;
        return taskBoardSingle(_id, company._id, actionUserCtx, {logger, languageCode});
    }),
);

router.post(
    "/portalOptions",
    // A portal session lives in the platform company, which keeps the board's tasks and answers its module gate (D197).
    authMW("private", {portalBuyer: platformCompany}),
    rateLimiter({windowMs: 60000, max: 60}),
    validateFormZod(validateSingleForm),
    asyncHandler(async (params: AuthenticatedMWType & SingleForm): Promise<TaskBoardPortalOptionsResponse> => {
        const {company, userInfo, logger, languageCode, _id} = params;
        const task = await loadPublicTask(_id, {logger, languageCode});
        return {data: await portalQuoteOptions(task, userInfo, company._id, {logger, languageCode})};
    }),
);
