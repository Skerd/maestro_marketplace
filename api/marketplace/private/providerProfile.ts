import {ObjectId} from "mongodb";
import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import type {AuthenticatedMWType} from "@coreModule/utilities/middlewares/authMW";
import {buildCreateDataFromSchemaDef, buildUpdateDataFromSchemaDef} from "@coreModule/api/buildUpdateDataFromSchemaDef";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {
    ProviderProfileSchemaDef,
    type CreateProviderProfileFormType,
    type EditProviderProfileFormType,
} from "armonia/src/modules/marketplace/api/marketplace/private/providerProfile/providerProfile.schema-def";
import {createProviderProfileFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/providerProfile/createProviderProfile.form.validator";
import {editProviderProfileFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/providerProfile/editProviderProfile.form.validator";
import {providerProfileFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/providerProfile/providerProfile.form.validator";
import {userService} from "@coreModule/database/schemas/user/user.service";
import ProviderProfile, {type IProviderProfile} from "@marketplaceModule/database/schemas/providerProfile/providerProfile";
import {providerProfileService} from "@marketplaceModule/database/schemas/providerProfile/providerProfile.service";
import {ProviderProfileActions} from "@marketplaceModule/database/schemas/providerProfile/providerProfile.actions";
import {
    providerProfileToDTO,
    providerProfilesToDTOArray,
} from "@marketplaceModule/utilities/mappers/providerProfile/providerProfileMapper.dto";
import {providerProfilesToSelect} from "@marketplaceModule/utilities/mappers/providerProfile/providerProfileMapper.select";
import {loadProviderProfileMetrics} from "@marketplaceModule/utilities/mappers/providerProfile/providerProfileMetrics";
import {restoreUnlessKeyTaken} from "@coreModule/api/restoreUnlessKeyTaken";
import {isValidTimeZone} from "@coreModule/utilities/time/timeWindows";
import {providerProfileHub} from "@marketplaceModule/utilities/services/recordHubs";

/** The profile with its metrics and, as its hub, the provider's listings, orders, bids and reviews (UX-03). */
async function providerProfileWithHub(
    doc: IProviderProfile,
    {company, actionUserCtx, logger, languageCode}: Pick<AuthenticatedMWType, "company" | "actionUserCtx" | "logger" | "languageCode">,
) {
    const [metrics, hub] = await Promise.all([
        loadProviderProfileMetrics(doc.user._id, company._id, {logger, languageCode}),
        providerProfileHub(doc.user._id, {companyId: company._id, actionUserCtx, languageCode}),
    ]);
    return {...providerProfileToDTO(doc, metrics), ...hub};
}

const buildCreate = buildCreateDataFromSchemaDef(ProviderProfileSchemaDef);
const buildUpdate = buildUpdateDataFromSchemaDef(ProviderProfileSchemaDef);

/** The Zod contract can't compare fields, so the zone name and each window are checked here (D105). */
function assertValidSchedule(data: {timezone?: string; availability?: {startTime?: string; endTime?: string}[]}, languageCode: string): void {
    const zone = data.timezone?.trim();
    if (zone && !isValidTimeZone(zone)) {
        throw apiValidationException("provider_invalid_timezone", "", null, languageCode, [zone]);
    }
    for (const window of data.availability ?? []) {
        if (window.startTime && window.endTime && window.endTime <= window.startTime) {
            throw apiValidationException("provider_availability_end_before_start", "", null, languageCode);
        }
    }
}

export const basePath = "/api/marketplace/providerProfile";
export const {router} = createCrudRouter<IProviderProfile, CreateProviderProfileFormType, EditProviderProfileFormType>({
    collectionName: "providerprofiles",
    model: ProviderProfile,
    service: providerProfileService,
    entityName: "ProviderProfile",
    defaultSort: {createdAt: -1},
    createSchema: createProviderProfileFormSchema,
    editSchema: editProviderProfileFormSchema,
    toDTO: (doc) => providerProfileToDTO(doc),
    toDTOArray: providerProfilesToDTOArray,
    toSelect: providerProfilesToSelect,
    listSchema: providerProfileFormSchema,
    /** Account page narrows to one user; the company list shows every profile. */
    extraListFilter: ({userId}) => (userId ? {user: new ObjectId(userId)} : {}),
    /** One live profile per user; the user is the caller unless the form names another. */
    buildCreateData: async (params) => {
        const {actionUserCtx, company, session, logger, languageCode} = params;
        const user = new ObjectId(params.userId ?? actionUserCtx.userId);
        if (!user.equals(actionUserCtx.userId)
            && !(await userService.findOne({_id: user, companies: company._id}, {session, logger, languageCode}, null, "_id"))) {
            throw apiValidationException("cant_access_this_user", "user", null, languageCode);
        }
        if (await providerProfileService.findOne({user, company: company._id}, {session, logger, languageCode}, null, "_id")) {
            throw apiValidationException("provider_profile_already_exists", null, null, languageCode);
        }
        assertValidSchedule(params, languageCode);
        return {...buildCreate(params), user};
    },
    buildUpdateData: (params, writeFields) => {
        assertValidSchedule(params, params.languageCode);
        return buildUpdate(params, writeFields);
    },
    enrichSingle: (doc, params) => providerProfileWithHub(doc, params),
    enrichUpdate: (doc, params) => providerProfileWithHub(doc, params),
    overrideRestoreHandler: restoreUnlessKeyTaken({
        model: ProviderProfile,
        service: providerProfileService,
        entityName: "ProviderProfile",
        keys: ["user"],
        errorCode: "provider_profile_already_exists",
    }),
    rateLimits: {read: 60, write: 30, delete: 20},
    // Stripe Connect onboarding: POST /api/marketplace/providerProfile/{createAccountLink|refreshAccountStatus}
    actions: ProviderProfileActions,
});
