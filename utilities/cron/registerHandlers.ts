import {registerCronHandler} from "@coreModule/cronjobs/registry/handlerRegistry";
import {runOrderAutoComplete} from "@marketplaceModule/utilities/cronJobs/orderAutoCompleteJob";
import {runTaskRequestExpiry} from "@marketplaceModule/utilities/cronJobs/taskRequestExpiryJob";
import {runTaskRematch} from "@marketplaceModule/utilities/services/jobMatching";
import {CONSTANTS} from "@coreModule/environment";

export function registerMarketplaceCronHandlers(): void {
    registerCronHandler({
        code: "marketplace.orderAutoComplete",
        handler: async ctx => {
            await runOrderAutoComplete(ctx.company, ctx.logger);
        },
        defaultJob: {
            name: "Order auto-complete",
            cronExpression: "0 0 * * * *",
            priority: 20,
        },
    });

    registerCronHandler({
        code: "marketplace.taskRequestExpiry",
        handler: async ctx => {
            await runTaskRequestExpiry(ctx.company, ctx.logger);
        },
        defaultJob: {
            name: "Task request expiry",
            cronExpression: "0 0 * * * *",
            priority: 20,
        },
    });

    // D143: open jobs are topped up daily with the pros who now fit (new listings, changed areas), until they expire.
    registerCronHandler({
        code: "marketplace.taskRematch",
        handler: async ctx => {
            const reached = await runTaskRematch(ctx.company, {logger: ctx.logger, languageCode: CONSTANTS.DEFAULT_LANGUAGE ?? "en-US"});
            ctx.logger.debug(`Task re-match reached ${reached} new provider(s)`);
        },
        defaultJob: {
            name: "Task re-match",
            cronExpression: "0 30 6 * * *",
            priority: 30,
        },
    });
}
