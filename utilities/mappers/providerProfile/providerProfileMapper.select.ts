import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";
import type {IProviderProfile} from "@marketplaceModule/database/schemas/providerProfile/providerProfile";

export function providerProfileToSelect(profile: IProviderProfile): ApiSelectDatum {
    const user = profile.user as {name?: string; surname?: string} | undefined;
    const label = [user?.name, user?.surname].filter(Boolean).join(" ") || user?.name || profile._id.toString();
    return {
        value: profile._id.toString(),
        label,
    };
}

export function providerProfilesToSelect(profiles: IProviderProfile[]): ApiSelectDatum[] {
    return profiles.map(providerProfileToSelect);
}
