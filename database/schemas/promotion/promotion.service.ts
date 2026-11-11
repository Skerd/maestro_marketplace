/**
 * Promotion Service
 *
 * CRUD service for Promotion model.
 */

import type {ObjectId} from "mongodb";
import { BaseCrudService, type CrudOptions } from "@coreModule/database/services/baseCrudService";
import Promotion, { IPromotion } from "@marketplaceModule/database/schemas/promotion/promotion";

export class PromotionService extends BaseCrudService<IPromotion, typeof Promotion> {
    constructor() {
        super(Promotion, "Promotion");
    }

    /** The company's promotions running right now (active and inside their date window). */
    findRunning(companyId: ObjectId, opts: CrudOptions): Promise<IPromotion[]> {
        const now = new Date();
        return this.find(
            {
                company: companyId,
                lifecycleStatus: "active",
                startAt: {$lte: now},
                endAt: {$gte: now},
            },
            opts,
            null,
            "_id listing type",
            {startAt: 1},
        );
    }
}

export const promotionService = new PromotionService();
