import * as fs from "fs";
import * as path from "path";
import {CLIENT_SIDE, CONSTANTS, EMAIL} from "@coreModule/environment";
import {applyPlaceholders, loadEmailStrings} from "@coreModule/utilities/emails/emailLocale";
import {
    ctaButtonHtml,
    currentYear,
    escapeHtml,
    layoutStrings,
    localized,
    pushRow,
    summaryCardHtml,
    type SummaryRow,
} from "@coreModule/utilities/emails/emailLayout";
import {sendMail} from "@coreModule/utilities/emails/mailDeliveryService";

const LOCALES_ROOT = path.join(__dirname, "static", "locales");
const TEMPLATE_DIR = path.join(__dirname, "templates", "newLead");

export type NewLeadEmail = {
    /** The provider's company: its SMTP sends the email. */
    companyId: string;
    companyName: string;
    languageCode: string;
    email: string;
    fullName: string;
    jobTitle: string;
    categoryName?: string;
    /** City level only (D143). */
    cityName?: string;
    /** Absent for online work. */
    distanceKm?: number;
    /** The "up to" amount, already formatted, e.g. "60 EUR"; absent = open budget. */
    budget?: string;
    listingTitle?: string;
    /** The lead on the panel host. */
    leadUrl: string;
};

function readTemplate(filename: string): string {
    return fs.readFileSync(path.join(TEMPLATE_DIR, filename), "utf8");
}

/**
 * Tells a provider that a portal job matches their services (D143, D145): what, where, how far and the budget, never
 * the street or the client, with a button to the lead. Sent over the provider company's SMTP, in the shell of the other
 * client emails. Does nothing when email is off.
 */
export async function sendNewLeadMail(data: NewLeadEmail): Promise<void> {
    if (!EMAIL.ENABLED) return;
    const languageCode = data.languageCode || CONSTANTS.DEFAULT_LANGUAGE || "en-US";
    const strings = loadEmailStrings(["newLead"], languageCode, LOCALES_ROOT);
    const loc = strings as Record<string, string>;

    const rows: SummaryRow[] = [];
    pushRow(rows, loc.labelJob, data.jobTitle);
    pushRow(rows, loc.labelCategory, data.categoryName);
    pushRow(rows, loc.labelWhere, data.distanceKm != null
        ? applyPlaceholders(loc.whereOnsite ?? "", {city: data.cityName ?? "", km: String(data.distanceKm)})
        : loc.whereOnline);
    pushRow(rows, loc.labelBudget, data.budget ? applyPlaceholders(loc.budgetUpTo ?? "", {amount: data.budget}) : loc.budgetOpen);

    const bodyInner = applyPlaceholders(readTemplate("body.html"), {
        intro: escapeHtml(applyPlaceholders(loc[data.listingTitle ? "introListing" : "intro"] ?? "", {listing: data.listingTitle ?? ""})),
        detailsSummary: summaryCardHtml(loc.summaryTitle ?? "", rows),
        cta: ctaButtonHtml(loc.cta ?? "", data.leadUrl, loc.fallbackLabel ?? ""),
        closing: loc.closing ?? "",
    });

    let html = applyPlaceholders(readTemplate("newLead.html"), layoutStrings(strings, "heading", "preheader"));
    html = applyPlaceholders(html, {
        greeting: localized(strings, "greeting", {fullName: escapeHtml(data.fullName)}),
        bodyInner,
        companyName: escapeHtml(data.companyName),
        pageName: CLIENT_SIDE.NAME ?? "",
        year: currentYear(),
    });
    const subject = applyPlaceholders(loc.subject ?? "", {title: data.jobTitle, companyName: data.companyName});
    await sendMail(data.companyId, {to: data.email, subject, html});
}
