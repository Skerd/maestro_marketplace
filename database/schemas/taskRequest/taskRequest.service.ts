import TaskRequest, { ITaskRequest } from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import { BaseCrudService } from "@coreModule/database/services/baseCrudService";

export class TaskRequestService extends BaseCrudService<ITaskRequest, typeof TaskRequest> {
    constructor() {
        super(TaskRequest, "TaskRequest");
    }
}

export const taskRequestService = new TaskRequestService();
