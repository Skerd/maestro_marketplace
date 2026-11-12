import {createCrudRouter} from "@coreModule/api/crudRouterFactory";
import {validateSingleForm} from "armonia/src/modules/core/utilities/zod/shared.validator";
import TaskLead, {type ITaskLead} from "@marketplaceModule/database/schemas/taskLead/taskLead";
import {taskLeadService} from "@marketplaceModule/database/schemas/taskLead/taskLead.service";
import {TaskLeadActions} from "@marketplaceModule/database/schemas/taskLead/taskLead.actions";
import {taskLeadToDTO, taskLeadToSelect} from "@marketplaceModule/utilities/mappers/taskLead/taskLeadMapper.dto";
import {leadVisibilityFilter, markLeadViewed, taskLeadsToViews} from "@marketplaceModule/utilities/services/taskLeads";

/**
 * A provider company's leads (D143): read-only, written by the job matching and the quote / decline actions. Each row
 * carries the job it points at (city level, no buyer) and the quote placed from it; opening a new lead marks it viewed.
 */
export const basePath = "/api/marketplace/taskLead";
export const {router} = createCrudRouter<ITaskLead>({
    collectionName: "taskleads",
    model: TaskLead,
    service: taskLeadService,
    entityName: "TaskLead",
    defaultSort: {createdAt: -1},
    createSchema: validateSingleForm,
    buildCreateData: () => ({}),
    editSchema: validateSingleForm,
    buildUpdateData: () => ({}),
    toDTO: (lead) => taskLeadToDTO(lead),
    toDTOArray: (leads) => leads.map((lead) => taskLeadToDTO(lead)),
    toSelect: (leads) => leads.map(taskLeadToSelect),
    documentFilter: ({company, actionUserCtx}) => leadVisibilityFilter(company._id, actionUserCtx),
    extraSelectFilter: ({company, actionUserCtx}) => leadVisibilityFilter(company._id, actionUserCtx),
    enrichList: (docs, {logger, languageCode}) => taskLeadsToViews(docs, {logger, languageCode}),
    enrichSingle: async (doc, {logger, languageCode, actionUserCtx}) => {
        const ctx = {logger, languageCode};
        return (await taskLeadsToViews([await markLeadViewed(doc, actionUserCtx, ctx)], ctx))[0];
    },
    actions: TaskLeadActions,
    rateLimits: {read: 60, write: 30, delete: 20},
});
