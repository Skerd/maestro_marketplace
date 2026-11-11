import { ITaskRequest } from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import {type ApiSelectDatum} from "armonia/src/modules/core/types/shared.types";

export function taskRequestToSelect(taskRequest: ITaskRequest): ApiSelectDatum {
    const title = [taskRequest.name, taskRequest.title].filter(Boolean).join(" - ") || taskRequest.name || "";
    return {
        value: taskRequest._id.toString(),
        label: title
    };
}

export function taskRequestsToSelect(taskRequests: ITaskRequest[]): ApiSelectDatum[] {
    return taskRequests.map(taskRequestToSelect);
}