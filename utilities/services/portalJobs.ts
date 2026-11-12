import {ObjectId} from "mongodb";
import type {ClientSession} from "mongoose";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import {asCrossTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {companyService} from "@coreModule/database/schemas/company/company.service";
import {mediaService} from "@coreModule/database/schemas/media/media.service";
import {isPortalZoneOrigin, portalSiteSlug} from "@coreModule/utilities/marketing/portalOrigin";
import {findPortalSiteCompany} from "@coreModule/utilities/marketing/portalCompanies";
import {sameCurrencyIn, samePlacesIn} from "@coreModule/utilities/helpers/referenceData";
import type {ICompany} from "@coreModule/database/schemas/company/company";
import {taskRequestService} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.service";
import {marketplaceConfigService} from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig.service";
import {marketplaceOperatorCompanyId} from "@marketplaceModule/utilities/services/marketplaceOperator";

/** Open jobs one buyer may have at a time (D143): enough for real needs, little room for spam. */
export const JOB_OPEN_LIMIT = 5;

/**
 * Runs a portal buyer's job work in the marketplace operator (D143), where every portal job lives: its tenant, and
 * `company` = the operator for the code that reads `params.company`.
 */
export async function asJobBuyer<P extends {company: ICompany; languageCode: string; session?: ClientSession | null}, R>(
    params: P,
    work: (params: P) => Promise<R>,
): Promise<R> {
    const operatorId = await marketplaceOperatorCompanyId(params.languageCode);
    const operator = await companyService.findByIdOrThrow(operatorId, {session: params.session ?? undefined, languageCode: params.languageCode}, [], "name isActive modules isPlatformOwner timezone");
    return withTenant(operatorId, () => work({...params, company: operator}), "marketplace");
}

/** The company whose own site a job was posted on; undefined on the apex. Refused when that site has no services. */
export async function jobSiteCompany(origin: string | undefined, languageCode: string): Promise<ObjectId | undefined> {
    const slug = portalSiteSlug(origin ?? "");
    if (!slug) return undefined;
    return (await findPortalSiteCompany(slug, "marketplace", languageCode))._id;
}

/** Refuses a new job while the buyer already has `JOB_OPEN_LIMIT` open ones in the operator. */
export async function assertJobOpenLimit(operatorId: ObjectId, requester: ObjectId, languageCode: string, session?: ClientSession | null): Promise<void> {
    const open = await taskRequestService.count({company: operatorId, requester, status: "open"}, {session: session ?? undefined, languageCode});
    if (open >= JOB_OPEN_LIMIT) throw apiValidationException("task_request_open_limit", "", null, languageCode, [String(JOB_OPEN_LIMIT)]);
}


/**
 * Moves a job the buyer filled in on any site into the operator: its currency and places become the operator's own
 * copies (each company holds its own), and the photos the buyer uploaded are shared with the operator so the job may
 * name them (D104). A place the operator does not have is refused.
 */
export async function intoOperator(
    // The SchemaDef create builder's own shape (`buildCreateDataFromSchemaDef`).
    data: Record<string, any>,
    operatorId: ObjectId,
    uploader: ObjectId,
    languageCode: string,
    session?: ClientSession | null,
): Promise<Record<string, any>> {
    const opts = {session: session ?? undefined, languageCode};
    const currencyRef = nestedEntityToRef(data.currency as never);
    const currency = (currencyRef ? await sameCurrencyIn(operatorId, currencyRef, opts) : undefined)
        ?? await marketplaceConfigService.currencyRefOf(operatorId, opts);
    if (!currency) throw apiValidationException("marketplace_currency_not_configured", "", null, languageCode);

    let address: Record<string, unknown> | undefined = data.address;
    if (address) {
        const places = await samePlacesIn(operatorId, {
            country: nestedEntityToRef(address.country as never),
            state: nestedEntityToRef(address.state as never),
            city: nestedEntityToRef(address.city as never),
        }, opts);
        if (!places.country || !places.city) throw apiValidationException("not_found", "address", null, languageCode);
        address = {...address, country: places.country, city: places.city, ...(places.state ? {state: places.state} : {})};
        if (!places.state) delete address.state;
    }

    const media = [data.mainImage, ...(data.imageGallery ?? []), ...(data.videoGallery ?? [])]
        .map((ref) => nestedEntityToRef(ref as never))
        .filter((ref): ref is ObjectId => !!ref);
    if (media.length) {
        // Only the buyer's own uploads; the operator may then store and show them.
        await asCrossTenant("a portal buyer's photos are shared with the marketplace operator that keeps the job", () =>
            mediaService.updateMany({_id: {$in: media}, createdBy: uploader}, {$addToSet: {sharedWithCompanies: operatorId}}, {session: session ?? undefined}));
    }
    return {...data, currency, ...(address ? {address} : {})};
}

/** A buyer action on a job: from the portal zone the job is the operator's, from the panel the session company's. */
export function inJobCompany<P extends {company: ICompany; languageCode: string; origin?: string; session?: ClientSession | null}, R>(
    params: P,
    work: (params: P) => Promise<R>,
): Promise<R> {
    return isPortalZoneOrigin(params.origin ?? "") ? asJobBuyer(params, work) : work(params);
}
