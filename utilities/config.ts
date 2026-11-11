/**
 * Env-backed configuration of the services marketplace.
 * Operational limits and Connect onboarding redirects live here — not in core.
 */

import {clientHostFor} from "@coreModule/environment";

function parseIntEnv(key: string, fallback: number): number {
    const raw = process.env[key];
    if (raw == null || raw.trim() === "") return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
}

export type MarketplaceEnvConfig = {
    /** Days after delivery due date before auto-accepting a submitted delivery. */
    autoAcceptDays: number;
    /** Max revision requests allowed per marketplace order. */
    maxRevisions: number;
    /** Stripe Connect Express return URL (provider onboarding). */
    stripeConnectReturnUrl: string;
    /** Stripe Connect Express refresh URL (provider onboarding). */
    stripeConnectRefreshUrl: string;
};

function defaultConnectUrls(): {returnUrl: string; refreshUrl: string} {
    const base = clientHostFor("core");
    return {
        returnUrl: base ? `${base}/account/providerprofile?connect=return` : "",
        refreshUrl: base ? `${base}/account/providerprofile?connect=refresh` : "",
    };
}

export function getMarketplaceEnvConfig(): MarketplaceEnvConfig {
    const defaults = defaultConnectUrls();
    return {
        autoAcceptDays: parseIntEnv("MARKETPLACE_AUTO_ACCEPT_DAYS", 3),
        maxRevisions: parseIntEnv("MARKETPLACE_MAX_REVISIONS", 3),
        stripeConnectReturnUrl:
            process.env.STRIPE_CONNECT_RETURN_URL?.trim() || defaults.returnUrl,
        stripeConnectRefreshUrl:
            process.env.STRIPE_CONNECT_REFRESH_URL?.trim() || defaults.refreshUrl,
    };
}
