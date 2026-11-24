import {KAFKA} from "@coreModule/environment";
import {emailTopicSpec, startKafkaTopicConsumers} from "@coreModule/kafka/kafkaConsumer";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {MARKETPLACE_KAFKA} from "@marketplaceModule/environment";
import {sendNewLeadMail} from "@marketplaceModule/utilities/emails/sendNewLeadMail";
import {sendNewQuoteMail} from "@marketplaceModule/utilities/emails/sendNewQuoteMail";
import type {NewLeadEmailEvent, NewQuoteEmailEvent} from "./types";

/** The new-lead and new-quote email consumers (D188), each on its own topic; the kafkaServer starts them. */
export async function startMarketplaceKafkaConsumers(parentLogger?: serverLogger): Promise<void> {
    const log = getLogger("marketplace_kafka_consumers", parentLogger);
    if (!KAFKA.ENABLED) {
        log.warn("Kafka is disabled; skipping marketplace consumers.");
        return;
    }
    log.start("Starting marketplace Kafka consumers");
    await startKafkaTopicConsumers(parentLogger, log, [
        emailTopicSpec(MARKETPLACE_KAFKA, "NEW_LEAD_EMAIL", (event) => sendNewLeadMail(event as NewLeadEmailEvent)),
        emailTopicSpec(MARKETPLACE_KAFKA, "NEW_QUOTE_EMAIL", (event) => sendNewQuoteMail(event as NewQuoteEmailEvent)),
    ]);
    log.finish("Marketplace Kafka consumers startup pass complete");
}
