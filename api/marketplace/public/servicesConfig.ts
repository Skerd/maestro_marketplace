import {Router} from "express";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import authMW from "@coreModule/utilities/middlewares/authMW";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import {currencyService} from "@coreModule/database/schemas/currency/currency.service";
import {resolveStorefrontContext} from "@coreModule/utilities/marketing/portalStorefront";
import {PORTAL_CURRENCY_SELECT, toPortalCurrency} from "@coreModule/utilities/mappers/portal/portalStorefrontMapper.dto";
import {PAYMENTS} from "@financeModule/environment";
import {marketplaceConfigService} from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig.service";
import type {ServicesConfigResponse} from "armonia/src/modules/marketplace/api/marketplace/public/servicesConfig/servicesConfig.types";

export const basePath = "/api/marketplace/servicesConfig";
export const router = Router();

/**
 * Public bootstrap of the services pages. Only ever exposes the Stripe PUBLISHABLE key: the secret key and the
 * webhook secret stay in maestro. The apex works on the platform company's own settings (a task request posted there
 * is the platform's record), a company's site on that company's.
 */
router.get(
    "",
    authMW("public"),
    rateLimiter({windowMs: 60000, max: 60}),
    asyncHandler(async (params: any): Promise<ServicesConfigResponse> => {
        const {languageCode, origin} = params;
        const ctx = await resolveStorefrontContext(origin, languageCode);
        const company = ctx.mode === "tenant" ? ctx.company : ctx.sessionCompany;
        const currencyId = await marketplaceConfigService.currencyRefOf(company._id, {languageCode});
        const currency = currencyId ? toPortalCurrency(await currencyService.findById(currencyId, {languageCode}, undefined, PORTAL_CURRENCY_SELECT)) : undefined;
        return {
            data: {
                mode: ctx.mode,
                stripePublishableKey: PAYMENTS.STRIPE_ENABLED ? PAYMENTS.STRIPE_PUBLISHABLE_KEY || undefined : undefined,
                currency,
            },
        };
    }),
);
