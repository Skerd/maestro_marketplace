import type {IProviderProfile} from "@marketplaceModule/database/schemas/providerProfile/providerProfile";
import type {ProviderProfile} from "armonia/src/modules/marketplace/api/marketplace/private/providerProfile/providerProfile.dto";
import type {SimpleUser} from "armonia/src/modules/core/dto/user.dto";
import {SimpleUserSnippet} from "@coreModule/database/schemas/user/user.snippets";
import {mapMedia, mapSnippet} from "@coreModule/utilities/mappers/common.mapper";
import {
    mapLifeCycleToDTO,
    mapOwnershipToDTO,
    mapSoftDeleteToDTO,
} from "@coreModule/utilities/mappers/plugin/pluginMappers.dto";
import type {ProviderProfileMetrics} from "@marketplaceModule/utilities/mappers/providerProfile/providerProfileMetrics";

export function providerProfileToDTO(profile: IProviderProfile, metrics?: ProviderProfileMetrics): ProviderProfile {
    return {
        _id: profile._id.toString(),
        user: mapSnippet<SimpleUser>()(profile.user, SimpleUserSnippet),
        skills: profile.skills ?? [],
        bio: profile.bio,
        portfolio: profile.portfolio?.length ? profile.portfolio.map(mapMedia) : undefined,
        availability: (profile.availability ?? []).map((slot) => ({
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
        })),
        timezone: profile.timezone || undefined,
        averageRating: metrics?.averageRating,
        reviewCount: metrics?.reviewCount,
        completionRate: metrics?.completionRate,
        stripeAccountId: profile.stripeAccountId,
        stripeChargesEnabled: profile.stripeChargesEnabled,
        stripePayoutsEnabled: profile.stripePayoutsEnabled,
        stripeDetailsSubmitted: profile.stripeDetailsSubmitted,
        stripeAccountSyncedAt: profile.stripeAccountSyncedAt?.toISOString(),
        ...mapOwnershipToDTO(profile),
        ...mapSoftDeleteToDTO(profile),
        ...mapLifeCycleToDTO(profile),
    };
}

export function providerProfilesToDTOArray(profiles: IProviderProfile[]): ProviderProfile[] {
    return profiles.map((profile) => providerProfileToDTO(profile));
}
