import type {ObjectId} from "mongodb";
import type {CrudOptions} from "@coreModule/database/services/baseCrudService";
import {companyTimeZoneOf} from "@coreModule/utilities/time/companyTimeZone";
import {expandWeeklyHours, isCovered, isValidTimeZone} from "@coreModule/utilities/time/timeWindows";
import type {ProviderAvailability} from "armonia/src/modules/marketplace/api/marketplace/private/providerProfile/providerProfile.dto";
import {providerProfileService} from "@marketplaceModule/database/schemas/providerProfile/providerProfile.service";

/**
 * When a provider can be booked (D105): their profile's weekly windows in the profile's zone, or the company's
 * zone (D91) when the profile names none or an unknown one. A provider without a profile has no windows.
 */
export async function loadProviderAvailability(
    providerUserId: ObjectId | string,
    companyId: ObjectId,
    opts: CrudOptions,
): Promise<ProviderAvailability> {
    const schedule = await providerProfileService.getSchedule(providerUserId, companyId, opts);
    const zone = schedule?.timezone?.trim();
    return {
        timeZone: zone && isValidTimeZone(zone) ? zone : await companyTimeZoneOf(companyId, {session: opts.session}),
        windows: (schedule?.availability ?? []).map(({dayOfWeek, startTime, endTime}) => ({dayOfWeek, startTime, endTime})),
    };
}

/**
 * True when `[startAt, endAt)` lies inside the provider's windows; no windows means any time. Windows are expanded
 * to real instants in the provider's zone, so a DST change moves them with the wall clock. Windows that touch are
 * one stretch: a session past midnight fits when one day's window ends at 24:00 and the next day's starts at 00:00.
 */
export function isWithinProviderAvailability(availability: ProviderAvailability, startAt: Date, endAt: Date): boolean {
    if (availability.windows.length === 0) return true;
    const windows = expandWeeklyHours(availability.windows, availability.timeZone, startAt, endAt);
    return isCovered({start: startAt, end: endAt}, windows);
}
