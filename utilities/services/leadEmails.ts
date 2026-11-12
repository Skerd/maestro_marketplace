import type {ObjectId} from "mongodb";
import {clientHostFor} from "@coreModule/environment";
import {getLogger} from "@coreModule/loggers/serverLog";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {filterUnmutedReceivers} from "@coreModule/domain/notifications/notificationDomainService";
import {notificationLink, receiverLanguage} from "@coreModule/domain/notifications/notificationTexts";
import {userService} from "@coreModule/database/schemas/user/user.service";
import {companyService} from "@coreModule/database/schemas/company/company.service";
import {cityService} from "@coreModule/database/schemas/city/city.service";
import {currencyService} from "@coreModule/database/schemas/currency/currency.service";
import type {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import {listingCategoryService} from "@marketplaceModule/database/schemas/listingCategory/listingCategory.service";
import {listingService} from "@marketplaceModule/database/schemas/listing/listing.service";
import {NotificationEventCodes} from "@marketplaceModule/domain/notifications/notificationEventCodes";
import {sendNewLeadMail} from "@marketplaceModule/utilities/emails/sendNewLeadMail";

const logger = getLogger("marketplace_lead_emails");
const REASON = "a new-lead email describes the operator's job to a provider in another company";

export type NewLead = {company: ObjectId; provider: ObjectId; lead: ObjectId; listing?: ObjectId; distanceKm?: number};

/**
 * Emails each provider a new lead reached (D145), next to the in-app notice and under the same switch: a provider who
 * turned "New matching task request" off gets neither (D117). Each email is in its receiver's language (D128) and links
 * to the lead on the panel. Best-effort: run after the commit, it never throws, so a mail failure loses no lead.
 */
export async function emailNewLeads(job: ITaskRequest, leads: NewLead[]): Promise<void> {
    const code = NotificationEventCodes.TASK_REQUEST_CREATED;
    try {
        await asCrossTenant(REASON, async () => {
            const categoryId = nestedEntityToRef(job.category);
            const cityId = nestedEntityToRef(job.address?.city);
            const currencyId = nestedEntityToRef(job.currency);
            const [category, city, currency] = await Promise.all([
                categoryId ? listingCategoryService.findById(categoryId, {}, undefined, "name") : null,
                cityId ? cityService.findById(cityId, {}, undefined, "name") : null,
                currencyId ? currencyService.findById(currencyId, {}, undefined, "abbreviation symbol") : null,
            ]);
            const unit = currency?.abbreviation ?? currency?.symbol ?? "";
            const budget = job.budgetMax != null ? `${job.budgetMax} ${unit}`.trim() : undefined;

            for (const lead of leads) {
                const [receiver] = await filterUnmutedReceivers([lead.provider.toString()], lead.company, code);
                if (!receiver) continue;
                const [user, company, listing] = await Promise.all([
                    userService.findById(lead.provider, {}, undefined, "username name surname fullName preferredLanguage"),
                    companyService.findById(lead.company, {}, undefined, "name"),
                    lead.listing ? listingService.findById(lead.listing, {}, undefined, "title") : null,
                ]);
                if (!user?.username) continue;
                const languageCode = receiverLanguage(user);
                const path = notificationLink(code, {leadId: lead.lead.toString()}, languageCode);
                if (!path) continue;
                await sendNewLeadMail({
                    companyId: lead.company.toString(),
                    companyName: company?.name ?? "",
                    languageCode,
                    email: user.username,
                    fullName: user.fullName || `${user.name ?? ""} ${user.surname ?? ""}`.trim() || user.username,
                    jobTitle: job.title,
                    categoryName: category?.name,
                    cityName: city?.name,
                    distanceKm: lead.distanceKm,
                    budget,
                    listingTitle: listing?.title,
                    leadUrl: `${clientHostFor("core")}${path}`,
                });
            }
        });
    } catch (error) {
        logger.err(`New-lead emails for job ${job._id.toString()} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
