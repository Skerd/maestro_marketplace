import {findPlatformCompanyId} from "@coreModule/utilities/security/platformAccess";
import {Router} from "express";
import {ObjectId} from "mongodb";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import authMW, {type NotAuthenticatedMWType} from "@coreModule/utilities/middlewares/authMW";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import {validateFormZod} from "@coreModule/utilities/middlewares/validateFormZod";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {resolveStorefrontContext} from "@coreModule/utilities/marketing/portalStorefront";
import {taskRequestService} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.service";
import {JOB_POPULATE, JOB_SELECT} from "@marketplaceModule/utilities/services/taskLeads";
import {toPortalSeller} from "@coreModule/utilities/mappers/portal/portalStorefrontMapper.dto";
import {
    publicTaskClause,
    TASK_SELLER_SELECT,
    taskQuoteStats,
    taskQuotingCompanies,
    toPublicTask,
} from "@marketplaceModule/utilities/services/publicTasks";
import {
    shopMarketplaceIdFormSchema,
    type ShopMarketplaceIdFormType,
} from "armonia/src/modules/marketplace/api/marketplace/public/shopMarketplace/shopMarketplace.form.validator";
import type {ShopTaskResponse} from "armonia/src/modules/marketplace/api/marketplace/public/shopTask/shopTask.types";

/**
 * One task of the public task board (D172), for anyone: what a provider sees before the award (city level, the
 * approximate area), the quotes' count and average, the board it is posted on and the companies that quoted (names and
 * sites, never amounts). Only on the apex (D197); a task posted on a provider's own site is not public (D143) and reads
 * as not found.
 */
export const basePath = "/api/marketplace/shopTask";
export const router = Router();

router.post(
    "",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 120}),
    validateFormZod(shopMarketplaceIdFormSchema),
    asyncHandler(async (params: NotAuthenticatedMWType & ShopMarketplaceIdFormType): Promise<ShopTaskResponse> => {
        const {languageCode, origin, logger, id} = params;
        const [ctx, platformId] = await Promise.all([resolveStorefrontContext(origin, languageCode), findPlatformCompanyId()]);
        if (!platformId || ctx.mode === "tenant") {
            throw apiValidationException("task_request_not_found", "", null, languageCode);
        }
        return asCrossTenant("the public task board shows the platform's tasks to everyone (D172)", async () => {
            const task = await taskRequestService.findOne(
                {_id: new ObjectId(id), ...publicTaskClause(platformId)},
                {withDeleted: false, logger, languageCode},
                [...JOB_POPULATE, {path: "company", select: TASK_SELLER_SELECT}],
                JOB_SELECT,
            );
            if (!task) throw apiValidationException("task_request_not_found", "", null, languageCode);
            const [stats, quotedBy] = await Promise.all([
                taskQuoteStats([task], {logger, languageCode}),
                taskQuotingCompanies(task._id, {logger, languageCode}),
            ]);
            const quotes = stats.get(task._id.toString()) ?? {count: 0};
            // The board is the platform company's and lives on the apex only (D197): it is named, never linked to a site.
            const seller = toPortalSeller(task.company);
            return {data: {...toPublicTask(task, quotes), seller: seller && {_id: seller._id, name: seller.name, ...(seller.logo ? {logo: seller.logo} : {})}, quotedBy}};
        });
    }),
);
