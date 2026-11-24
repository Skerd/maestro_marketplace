import {kafkaTopicErrors, type ModuleEnvironmentContext, type ValidationError} from "@coreModule/environment/validator";
import {MARKETPLACE_KAFKA} from "@marketplaceModule/environment";

/** marketplace's boot checks (D67): the lead and quote email Kafka topics, while Kafka is on (D188). */
export function validateEnvironment(ctx: ModuleEnvironmentContext): ValidationError[] {
    return kafkaTopicErrors(ctx, MARKETPLACE_KAFKA);
}
