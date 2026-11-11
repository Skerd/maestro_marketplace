import {registerCronHandler} from "@coreModule/cronjobs/registry/handlerRegistry";
import {runOrderAutoComplete} from "@marketplaceModule/utilities/cronJobs/orderAutoCompleteJob";
import {runTaskRequestExpiry} from "@marketplaceModule/utilities/cronJobs/taskRequestExpiryJob";

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
}
