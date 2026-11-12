import TaskLead, {ITaskLead} from "@marketplaceModule/database/schemas/taskLead/taskLead";
import {BaseCrudService} from "@coreModule/database/services/baseCrudService";

export class TaskLeadService extends BaseCrudService<ITaskLead, typeof TaskLead> {
    constructor() {
        super(TaskLead, "TaskLead");
    }
}

export const taskLeadService = new TaskLeadService();
