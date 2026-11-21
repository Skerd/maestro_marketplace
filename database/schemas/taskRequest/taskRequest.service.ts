import type {FilterQuery} from "mongoose";
import TaskRequest, { ITaskRequest } from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import { BaseCrudService } from "@coreModule/database/services/baseCrudService";
import type {CatalogPage} from "@coreModule/database/services/baseCrudService";

export class TaskRequestService extends BaseCrudService<ITaskRequest, typeof TaskRequest> {
    constructor() {
        super(TaskRequest, "TaskRequest");
    }

    /**
     * Live rows as plain objects for read-only catalog pages (the portal's task board), typed by the caller's
     * projection. One page, sorted, with the given references populated.
     */
    findCatalogRows<Row>(filter: FilterQuery<ITaskRequest>, page: CatalogPage) {
        return TaskRequest.find(filter).noDeleted()
            .select(page.select)
            .populate(page.populate)
            .sort(page.sort)
            .skip(page.skip).limit(page.limit)
            .lean<Row[]>();
    }
}

export const taskRequestService = new TaskRequestService();
