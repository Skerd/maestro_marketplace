import {ObjectId} from "mongodb";
import {mediaUploadMW} from "@coreModule/utilities/middlewares/mediaUploadMW";
import {createCrudRouter, type CrudCreateParams} from "@coreModule/api/crudRouterFactory";
import authMW, {type AuthenticatedMWType} from "@coreModule/utilities/middlewares/authMW";
import {asyncHandler} from "@coreModule/utilities/middlewares/asyncHandler";
import {rateLimiter} from "@coreModule/utilities/middlewares/rateLimiter";
import {transactionHandler} from "@coreModule/utilities/middlewares/transactionHandler";
import {validateFormZod} from "@coreModule/utilities/middlewares/validateFormZod";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {validatePagedForm, validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import type {PagedForm} from "armonia/src/modules/core/types/shared.types";
import {bidsToDTOArray} from "@marketplaceModule/utilities/mappers/bid/bidMapper.dto";
import {buildCreateDataFromSchemaDef, buildUpdateDataFromSchemaDef} from "@coreModule/api/buildUpdateDataFromSchemaDef";
import {assertCanDelete} from "@coreModule/database/relationsRegistry";
import {
    notifyMatchingProviders,
    TaskRequestActions,
    taskRequestExpiry,
} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.actions";
import {
    TaskRequestSchemaDef,
    type CreateTaskRequestFormType,
    type EditTaskRequestFormType,
} from "armonia/src/modules/marketplace/api/marketplace/private/taskRequest/taskRequest.schema-def";
import {createTaskRequestFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/taskRequest/createTaskRequest.form.validator";
import {editTaskRequestFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/taskRequest/editTaskRequest.form.validator";
import {taskRequestSelectFormSchema} from "armonia/src/modules/marketplace/api/marketplace/private/taskRequest/taskRequest.select.form.validator";
import TaskRequest, {type ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import {taskRequestService} from "@marketplaceModule/database/schemas/taskRequest/taskRequest.service";
import {bidService} from "@marketplaceModule/database/schemas/bid/bid.service";
import {taskRequestToDTO, taskRequestsToDTO} from "@marketplaceModule/utilities/mappers/taskRequest/taskRequestMapper.dto";
import {taskRequestsToSelect} from "@marketplaceModule/utilities/mappers/taskRequest/taskRequestMapper.select";
import {assertOwnerOrAdmin} from "@marketplaceModule/utilities/services/marketplaceAccess";
import type {SelectResponse} from "armonia/src/modules/core/types/shared.types";
import {escapeRegex} from "@coreModule/utilities/helpers";
import SchemaGuard from "@coreModule/database/security/schemaGuard";
import type {CrudOptions} from "@coreModule/database/services/baseCrudService";
import {taskRequestHub} from "@marketplaceModule/utilities/services/recordHubs";

const mediaUpload = mediaUploadMW({
    fields: {
        mainImage: 1,
        imageGallery: 8,
        videoGallery: 3,
    },
    maxFileSize: 250 * 1024 * 1024,
});

const buildCreate = buildCreateDataFromSchemaDef(TaskRequestSchemaDef);
const buildUpdate = buildUpdateDataFromSchemaDef(TaskRequestSchemaDef);

/** Live bid counts per task request. */
async function liveBidCounts(taskRequestIds: ObjectId[], companyId: ObjectId, opts: CrudOptions): Promise<Map<string, number>> {
    const counts = await bidService.aggregate(
        [
            {$match: {taskRequest: {$in: taskRequestIds}, company: companyId, deletedAt: null}},
            {$group: {_id: "$taskRequest", count: {$sum: 1}}},
        ],
        opts,
    );
    return new Map(counts.map((row: {_id: ObjectId; count: number}) => [row._id.toString(), row.count]));
}

/** The request with its live bid count and, as its hub, its bids and the order it led to (UX-03). */
async function taskRequestWithHub(
    doc: ITaskRequest,
    {company, actionUserCtx, logger, languageCode}: Pick<AuthenticatedMWType, "company" | "actionUserCtx" | "logger" | "languageCode">,
) {
    const [bidCount, hub] = await Promise.all([
        bidService.count({taskRequest: doc._id, company: company._id}, {logger, languageCode}),
        taskRequestHub(doc._id, {companyId: company._id, actionUserCtx, languageCode}),
    ]);
    return {...taskRequestToDTO(doc, bidCount), ...hub};
}

/** The caller posts the request; it opens now and expires on the standard window. */
function buildTaskRequestCreate(params: CrudCreateParams<CreateTaskRequestFormType>) {
    return {
        ...buildCreate(params),
        requester: new ObjectId(params.actionUserCtx.userId),
        status: "open" as const,
        expiresAt: taskRequestExpiry(),
    };
}

export const basePath = "/api/marketplace/taskRequest";
export const {router} = createCrudRouter<ITaskRequest, CreateTaskRequestFormType, EditTaskRequestFormType>({
    collectionName: "taskrequests",
    model: TaskRequest,
    service: taskRequestService,
    entityName: "TaskRequest",
    defaultSort: {createdAt: -1},
    createSchema: createTaskRequestFormSchema,
    editSchema: editTaskRequestFormSchema,
    toDTO: (doc) => taskRequestToDTO(doc),
    toDTOArray: (docs) => taskRequestsToDTO(docs),
    toSelect: taskRequestsToSelect,
    selectSchema: taskRequestSelectFormSchema,
    createMiddleware: [mediaUpload],
    editMiddleware: [mediaUpload],
    overrideSelectHandler: async (params): Promise<SelectResponse> => {
        const {logger, languageCode, company, name, limit, page, activeOnly, actionUserCtx} = params;

        logger.start("Fetching taskRequests for select...");

        const sanitizedFields = SchemaGuard.sanitizeFields(TaskRequest, {name: {}, title: {}}, "read", actionUserCtx, languageCode);
        const populate = SchemaGuard.generatePopulate(sanitizedFields, TaskRequest.schema);

        const filter: Record<string, unknown> = {company: company._id};
        if (name?.trim()) {
            const term = escapeRegex(name.trim());
            filter.$or = [
                {name: {$regex: term, $options: "i"}},
                {title: {$regex: term, $options: "i"}},
            ];
        }
        if (activeOnly) {
            filter.status = "open";
        }

        const [taskRequests, total] = await Promise.all([
            taskRequestService.find(filter, {logger, languageCode}, populate.populate, populate.select, {createdAt: -1}, limit, (page - 1) * limit),
            taskRequestService.count(filter, {logger, languageCode}),
        ]);

        logger.finish("Finished fetching taskRequests for select!");

        return {data: taskRequestsToSelect(taskRequests), total};
    },
    afterCreate: async (created, params) => {
        await notifyMatchingProviders(created, params);
    },
    enrichList: async (docs, params) => {
        const {logger, languageCode, company} = params;
        const counts = await liveBidCounts(docs.map((doc) => doc._id), company._id, {logger, languageCode});
        return taskRequestsToDTO(docs, counts);
    },
    enrichSingle: (doc, params) => taskRequestWithHub(doc, params),
    enrichUpdate: (doc, params) => taskRequestWithHub(doc, params),
    buildCreateData: buildTaskRequestCreate,
    buildUpdateData: (params, writeFields) => {
        assertOwnerOrAdmin(params.existing.requester, params.actionUserCtx, params.languageCode);
        return buildUpdate(params, writeFields);
    },
    beforeDelete: async (params, doc) => {
        assertOwnerOrAdmin(doc.requester, params.actionUserCtx, params.languageCode);
        await assertCanDelete(TaskRequest.modelName, doc._id, params.languageCode, params.session);
    },
    rateLimits: {read: 60, write: 30, delete: 20},
    actions: TaskRequestActions,
});

const BUYER_TASK_POPULATE = ["category", "currency", "address.country", "address.state", "address.city"];

/**
 * Buyer self-service routes (storefront account pages). Scoped hard to the
 * authenticated requester — no admin model permissions required.
 */
router.post(
    "/my",
    authMW("private"),
    rateLimiter({windowMs: 60000, max: 60}),
    validateFormZod(validatePagedForm),
    asyncHandler(async (params: AuthenticatedMWType & PagedForm) => {
        const {company, actionUserCtx, logger, languageCode} = params;
        const page = params.page ?? 1;
        const limit = params.limit ?? 10;
        const opts = {logger, languageCode};

        const filter = {company: company._id, requester: new ObjectId(actionUserCtx.userId)};
        const [taskRequests, total] = await Promise.all([
            taskRequestService.find(filter, opts, BUYER_TASK_POPULATE, undefined, {createdAt: -1}, limit, (page - 1) * limit),
            taskRequestService.count(filter, opts),
        ]);
        const counts = await liveBidCounts(taskRequests.map((doc) => doc._id), company._id, opts);

        return {data: taskRequestsToDTO(taskRequests, counts), total, page, limit};
    }),
);

router.post(
    "/mySingle",
    authMW("private"),
    rateLimiter({windowMs: 60000, max: 60}),
    validateFormZod(validateSingleForm),
    asyncHandler(async (params: AuthenticatedMWType & {_id: string}) => {
        const {company, actionUserCtx, logger, languageCode, _id} = params;
        const opts = {logger, languageCode};

        const taskRequest = await taskRequestService.findOne(
            {_id: new ObjectId(_id), company: company._id, requester: new ObjectId(actionUserCtx.userId)},
            opts,
            BUYER_TASK_POPULATE,
        );
        if (!taskRequest) throw apiValidationException("task_request_not_found", "", null, languageCode);

        const bids = await bidService.find(
            {taskRequest: taskRequest._id, company: company._id},
            opts,
            [{path: "bidder", select: "name surname photo"}, "currency"],
            undefined,
            {createdAt: -1},
        );

        return {data: {...taskRequestToDTO(taskRequest, bids.length), bids: bidsToDTOArray(bids)}};
    }),
);

/** Buyer self-service create (storefront account): the same rules as PUT, without the model permission. */
router.put(
    "/createMine",
    authMW("private"),
    rateLimiter({windowMs: 60000, max: 30}),
    transactionHandler(),
    mediaUpload,
    validateFormZod(createTaskRequestFormSchema),
    asyncHandler(async (params: CrudCreateParams<CreateTaskRequestFormType>) => {
        const {company, actionUserCtx, session, logger, languageCode} = params;
        const created = await taskRequestService.create(
            {...buildTaskRequestCreate(params), company: company._id},
            {session, logger, languageCode, auditUserId: actionUserCtx.userId},
        );
        await notifyMatchingProviders(created, params);
        return {data: {_id: created._id.toString()}};
    }),
);
