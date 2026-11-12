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
const TEMPLATE_DIR = path.join(__dirname, "templates", "newQuote");

export type NewQuoteEmail = {
    /** The company that keeps the job (the marketplace operator): its SMTP sends the email. */
    companyId: string;
    languageCode: string;
    email: string;
    fullName: string;
    jobTitle: string;
    /** The quoting provider's company. */
    providerCompany: string;
    providerName?: string;
    /** Already formatted, e.g. "45 EUR". */
    amount: string;
    deliveryDays: number;
    /** The job on the portal, where the buyer compares the quotes. */
    jobUrl: string;
};

function readTemplate(filename: string): string {
    return fs.readFileSync(path.join(TEMPLATE_DIR, filename), "utf8");
}

/**
 * Tells a buyer that a pro quoted on their job (D143, P12.4): who, how much and how soon, with a button to the job on
 * the portal. The portal has no notification list, so this email is the buyer's notice. Does nothing when email is off.
 */
export async function sendNewQuoteMail(data: NewQuoteEmail): Promise<void> {
    if (!EMAIL.ENABLED) return;
    const languageCode = data.languageCode || CONSTANTS.DEFAULT_LANGUAGE || "en-US";
    const strings = loadEmailStrings(["newQuote"], languageCode, LOCALES_ROOT);
    const loc = strings as Record<string, string>;

    const rows: SummaryRow[] = [];
    pushRow(rows, loc.labelJob, data.jobTitle);
    pushRow(rows, loc.labelProvider, [data.providerName, data.providerCompany].filter(Boolean).join(", "));
    pushRow(rows, loc.labelPrice, data.amount);
    pushRow(rows, loc.labelDays, applyPlaceholders(loc[data.deliveryDays === 1 ? "daysOne" : "daysMany"] ?? "", {days: String(data.deliveryDays)}));

    const bodyInner = applyPlaceholders(readTemplate("body.html"), {
        intro: escapeHtml(loc.intro ?? ""),
        detailsSummary: summaryCardHtml(loc.summaryTitle ?? "", rows),
        cta: ctaButtonHtml(loc.cta ?? "", data.jobUrl, loc.fallbackLabel ?? ""),
        closing: loc.closing ?? "",
    });

    let html = applyPlaceholders(readTemplate("newQuote.html"), layoutStrings(strings, "heading", "preheader"));
    html = applyPlaceholders(html, {
        greeting: localized(strings, "greeting", {fullName: escapeHtml(data.fullName)}),
        bodyInner,
        pageName: CLIENT_SIDE.NAME ?? "",
        year: currentYear(),
    });
    const subject = applyPlaceholders(loc.subject ?? "", {title: data.jobTitle, providerCompany: data.providerCompany});
    await sendMail(data.companyId, {to: data.email, subject, html});
}
