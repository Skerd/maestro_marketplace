import type {NewLeadEmail} from "@marketplaceModule/utilities/emails/sendNewLeadMail";
import type {NewQuoteEmail} from "@marketplaceModule/utilities/emails/sendNewQuoteMail";

/** A new-lead email to a provider, on its own topic (D188), already in the provider's language. */
export interface NewLeadEmailEvent extends NewLeadEmail {
    eventType: "new_lead_email";
    timestamp: number;
    leadId: string;
}

/** A new-quote email to a portal buyer, on its own topic (D188), already in the buyer's language. */
export interface NewQuoteEmailEvent extends NewQuoteEmail {
    eventType: "new_quote_email";
    timestamp: number;
    jobId: string;
}
