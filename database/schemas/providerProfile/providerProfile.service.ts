/**
 * ProviderProfile Service
 *
 * CRUD service for ProviderProfile model.
 */

import { ObjectId } from "mongodb";
import {BaseCrudService, CrudOptions} from "@coreModule/database/services/baseCrudService";
import ProviderProfile, {IProviderProfile} from "./providerProfile";

export type ProviderProfileSchedule = Pick<IProviderProfile, "availability" | "timezone">;

export class ProviderProfileService extends BaseCrudService<IProviderProfile, typeof ProviderProfile> {
    constructor() {
        super(ProviderProfile, "ProviderProfile");
    }

    /**
     * Connect account for escrow release transfers: only returned when the
     * provider finished onboarding and Stripe reports payouts enabled.
     */
    async getPayoutAccountId(
        providerUserId: ObjectId | string,
        companyId: ObjectId,
        opts: CrudOptions,
    ): Promise<string | undefined> {
        const profile = await ProviderProfile.findOne(
            {user: new ObjectId(providerUserId.toString()), company: companyId},
            {stripeAccountId: 1, stripePayoutsEnabled: 1},
            {session: opts.session},
        ).noDeleted();
        if (!profile?.stripeAccountId || !profile.stripePayoutsEnabled) return undefined;
        return profile.stripeAccountId;
    }

    /** The provider's availability windows and their zone as stored; null when the provider has no profile. */
    async getSchedule(
        providerUserId: ObjectId | string,
        companyId: ObjectId,
        opts: CrudOptions,
    ): Promise<ProviderProfileSchedule | null> {
        return ProviderProfile.findOne(
            {user: new ObjectId(providerUserId.toString()), company: companyId},
            {availability: 1, timezone: 1},
            {session: opts.session},
        ).noDeleted().lean<ProviderProfileSchedule>();
    }
}

export const providerProfileService = new ProviderProfileService();
