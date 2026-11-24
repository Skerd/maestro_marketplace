import {publishEvent} from "@coreModule/kafka/kafkaProducer";
import type {serverLogger} from "@coreModule/loggers/serverLog";
import {MARKETPLACE_KAFKA} from "@marketplaceModule/environment";
import type {NewLeadEmailEvent, NewQuoteEmailEvent} from "./types";

/**
 * Publishes a new-lead email, keyed by the lead.
 * @returns false when not published (see core `publishEvent`); the caller then sends it directly
 */
export function publishNewLeadEmail(event: NewLeadEmailEvent, log?: serverLogger): Promise<boolean> {
    return publishEvent(MARKETPLACE_KAFKA.TOPICS.NEW_LEAD_EMAIL, event.leadId, event, log);
}

/**
 * Publishes a new-quote email, keyed by the job, so a buyer's quote emails keep their order.
 * @returns false when not published (see core `publishEvent`); the caller then sends it directly
 */
export function publishNewQuoteEmail(event: NewQuoteEmailEvent, log?: serverLogger): Promise<boolean> {
    return publishEvent(MARKETPLACE_KAFKA.TOPICS.NEW_QUOTE_EMAIL, event.jobId, event, log);
}
