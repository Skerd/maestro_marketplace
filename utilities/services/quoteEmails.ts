import type {ObjectId} from "mongodb";
import {clientHostFor} from "@coreModule/environment";
import {getLogger} from "@coreModule/loggers/serverLog";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {receiverLanguage} from "@coreModule/domain/notifications/notificationTexts";
import {userService} from "@coreModule/database/schemas/user/user.service";
import {companyService} from "@coreModule/database/schemas/company/company.service";
import {currencyService} from "@coreModule/database/schemas/currency/currency.service";
import type {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import {sendNewQuoteMail} from "@marketplaceModule/utilities/emails/sendNewQuoteMail";

const logger = getLogger("marketplace_quote_emails");
const REASON = "a new-quote email names the provider company that quoted on the buyer's job in the operator";

export type NewQuote = {provider: ObjectId; providerCompany: ObjectId; amount: number; deliveryDays: number};

/**
 * Emails a portal buyer that a pro quoted on their job (D143, P12.4), in the buyer's language, with a button to the
 * job on the portal. The portal has no notification list, so this is the buyer's notice. Best-effort: run after the
 * commit, it never throws, so a mail failure loses no quote.
 */
export async function emailNewQuote(job: ITaskRequest, quote: NewQuote): Promise<void> {
    try {
        await asCrossTenant(REASON, async () => {
            const requester = nestedEntityToRef(job.requester);
            const currencyId = nestedEntityToRef(job.currency);
            const jobCompany = nestedEntityToRef(job.company);
            if (!requester || !jobCompany) return;
            const [buyer, provider, company, currency] = await Promise.all([
                userService.findById(requester, {}, undefined, "username name surname fullName preferredLanguage"),
                userService.findById(quote.provider, {}, undefined, "name surname"),
                companyService.findById(quote.providerCompany, {}, undefined, "name"),
                currencyId ? currencyService.findById(currencyId, {}, undefined, "abbreviation symbol") : null,
            ]);
            if (!buyer?.username) return;
            await sendNewQuoteMail({
                companyId: jobCompany.toString(),
                languageCode: receiverLanguage(buyer),
                email: buyer.username,
                fullName: buyer.fullName || `${buyer.name ?? ""} ${buyer.surname ?? ""}`.trim() || buyer.username,
                jobTitle: job.title,
                providerCompany: company?.name ?? "",
                providerName: [provider?.name, provider?.surname].filter(Boolean).join(" ") || undefined,
                amount: `${quote.amount} ${currency?.abbreviation ?? currency?.symbol ?? ""}`.trim(),
                deliveryDays: quote.deliveryDays,
                jobUrl: `${clientHostFor("portal")}/services/account/jobs/${job._id.toString()}`,
            });
        });
    } catch (error) {
        logger.err(`New-quote email for job ${job._id.toString()} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
