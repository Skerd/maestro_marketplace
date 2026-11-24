/** marketplace's Kafka topics, one per email kind (D188); required only while this module and Kafka are on. */
export const MARKETPLACE_KAFKA = {
    TOPICS: {
        NEW_LEAD_EMAIL: process.env.KAFKA_TOPIC_NEW_LEAD_EMAIL,
        NEW_QUOTE_EMAIL: process.env.KAFKA_TOPIC_NEW_QUOTE_EMAIL,
    },
    CONSUMER_GROUP: {
        NEW_LEAD_EMAIL: process.env.KAFKA_CONSUMER_GROUP_NEW_LEAD_EMAIL,
        NEW_QUOTE_EMAIL: process.env.KAFKA_CONSUMER_GROUP_NEW_QUOTE_EMAIL,
    },
};
