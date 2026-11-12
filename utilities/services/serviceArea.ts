import {ObjectId} from "mongodb";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import type {CrudOptions} from "@coreModule/database/services/baseCrudService";
import {listingCategoryService} from "@marketplaceModule/database/schemas/listingCategory/listingCategory.service";
import {marketplaceCategoryClause} from "@marketplaceModule/utilities/services/marketplaceOperator";

/** Where an on-site provider works from and how far they travel (D143). */
export type ServiceArea = {latitude: number; longitude: number; radiusKm: number};
/** The GeoJSON point of the service area's pin, which the job matching's geo index reads. */
export type ServiceAreaPoint = {type: "Point"; coordinates: [number, number]};

/**
 * A listing's place fields for its category: on-site work must have a service area and gets its point; remote work
 * has neither (null clears both). The category must be one of the shared tree's (D144).
 */
export async function listingServiceAreaFields(
    categoryId: ObjectId,
    serviceArea: ServiceArea | null | undefined,
    languageCode: string,
    opts: CrudOptions,
): Promise<{serviceArea: ServiceArea | null; serviceAreaPoint: ServiceAreaPoint | null}> {
    const category = await listingCategoryService.findOne({_id: categoryId, ...(await marketplaceCategoryClause())}, opts, null, "delivery");
    if (!category) throw apiValidationException("not_found", "category", null, languageCode);
    if (category.delivery !== "onsite") return {serviceArea: null, serviceAreaPoint: null};
    if (!serviceArea) throw apiValidationException("listing_service_area_required", "serviceArea", null, languageCode);
    const {latitude, longitude, radiusKm} = serviceArea;
    return {serviceArea: {latitude, longitude, radiusKm}, serviceAreaPoint: {type: "Point", coordinates: [longitude, latitude]}};
}
