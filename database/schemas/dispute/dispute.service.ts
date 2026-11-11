/**
 * Dispute Service
 *
 * CRUD service for Dispute model.
 */

import { BaseCrudService } from "@coreModule/database/services/baseCrudService";
import Dispute, { IDispute } from "@marketplaceModule/database/schemas/dispute/dispute";

export class DisputeService extends BaseCrudService<IDispute, typeof Dispute> {
    constructor() {
        super(Dispute, "Dispute");
    }
}

export const disputeService = new DisputeService();
