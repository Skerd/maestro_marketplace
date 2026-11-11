import type {ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";
import {IListingPackage} from "@marketplaceModule/database/schemas/listingPackage/listingPackage";

export function listingPackageToSelect(pkg: IListingPackage): ApiSelectDatum {
    const symbol = (pkg as any).price?.currency?.symbol ?? "";
    const amount = pkg.price?.amount ?? 0;
    const label = [pkg.name, symbol ? `${symbol}${amount}` : `${amount}`].filter(Boolean).join(" - ") || pkg.name;

    return {
        value: pkg._id.toString(),
        label,
    };
}

export function listingPackagesToSelect(packages: IListingPackage[]): ApiSelectDatum[] {
    return packages.map(listingPackageToSelect);
}
