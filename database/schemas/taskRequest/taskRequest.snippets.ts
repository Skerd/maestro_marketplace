import type {TaskRequestSimple} from "armonia/src/modules/marketplace/dto/taskRequest.dto";
import type {ITaskRequest} from "@marketplaceModule/database/schemas/taskRequest/taskRequest";
import {defineSnippet} from "@coreModule/database/utilities/snippet";

export const TaskRequestSimpleSnippet = defineSnippet<ITaskRequest, TaskRequestSimple>()({
    keys: {
        _id: {},
        title: {},
        name: {},
        status: {},
    },
});
