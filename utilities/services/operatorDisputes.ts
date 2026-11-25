import {ObjectId} from "mongodb";
import type {ClientSession} from "mongoose";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import {asCrossTenant, withTenant} from "@coreModule/utilities/endpoints/tenantScope";
import {runAfterCommit} from "@coreModule/utilities/middlewares/transactionUtils";
import {emitNotificationEvent} from "@coreModule/domain/notifications/notificationEventBus";
import {companyMemberIdsWithPermission} from "@coreModule/domain/roles/companyPermissionHolders";
import {companyService} from "@coreModule/database/schemas/company/company.service";
import type {ICompany} from "@coreModule/database/schemas/company/company";
import type {serverLogger} from "@coreModule/loggers/serverLog";
import type {UserContext} from "@coreModule/utilities/types/types";
import {disputeService} from "@marketplaceModule/database/schemas/dispute/dispute.service";
import type {IDispute} from "@marketplaceModule/database/schemas/dispute/dispute";
import type {IOrder} from "@marketplaceModule/database/schemas/order/order";
import {NotificationEventCodes} from "@marketplaceModule/domain/notifications/notificationEventCodes";
import {findMarketplaceOperatorId} from "@marketplaceModule/utilities/services/marketplaceOperator";

/**
 * The marketplace operator decides disputes (D191). A dispute stays in the company whose order it is about, with its
 * order, deliveries and escrow; the seller and the buyer reply and see it, but only an admin of the operator starts the
 * review, resolves, closes, removes or restores one, and the decision runs in the dispute's own company.
 */

export const OPERATOR_DISPUTES_REASON = "the marketplace operator decides the disputes of every company (D191)";

/** Whether the session company is the marketplace operator. */
export async function isMarketplaceOperator(companyId: ObjectId): Promise<boolean> {
    const operatorId = await findMarketplaceOperatorId();
    return !!operatorId && operatorId.equals(companyId);
}

/** Refuses with `dispute_operator_only` unless the caller is an admin of the marketplace operator. */
export async function assertDisputeOperator(companyId: ObjectId, caller: Pick<UserContext, "isAdmin">, languageCode: string): Promise<void> {
    if (!caller.isAdmin || !(await isMarketplaceOperator(companyId))) {
        throw apiValidationException("dispute_operator_only", null, null, languageCode);
    }
}

/** Refuses with `dispute_operator_only` unless the session company is the marketplace operator (its list's readers). */
export async function assertOperatorSession(companyId: ObjectId, languageCode: string): Promise<void> {
    if (!(await isMarketplaceOperator(companyId))) {
        throw apiValidationException("dispute_operator_only", null, null, languageCode);
    }
}

/**
 * Runs the operator's work on one dispute (`_id`) in the dispute's own company: its tenant, and `company` = that company
 * for the code that reads `params.company`. The caller must be an admin of the operator.
 */
export async function inDisputeCompany<P extends {company: ICompany; actionUserCtx: UserContext; languageCode: string; session?: ClientSession | null; _id: string}, R>(
    params: P,
    work: (params: P) => Promise<R>,
): Promise<R> {
    const {company, actionUserCtx, languageCode, session} = params;
    await assertDisputeOperator(company._id, actionUserCtx, languageCode);
    const opts = {session: session ?? undefined, languageCode, withDeleted: true};
    const dispute = await asCrossTenant(OPERATOR_DISPUTES_REASON, () => disputeService.findOneOrThrow({_id: new ObjectId(params._id)}, opts, null, "company"));
    const disputeCompany = await companyService.findByIdOrThrow(dispute.company._id, {session: session ?? undefined, languageCode}, [], "name isActive modules isPlatformOwner timezone");
    return withTenant(disputeCompany._id, () => work({...params, company: disputeCompany}), "marketplace");
}

/**
 * Tells the operator's admins that a dispute waits for their decision, after the commit; its notice opens the dispute
 * on their Disputes list.
 */
export async function notifyOperatorOfDispute(
    dispute: IDispute,
    order: IOrder,
    ctx: {company: Pick<ICompany, "_id" | "name">; languageCode: string; session?: ClientSession | null; logger: serverLogger},
): Promise<void> {
    const operatorId = await findMarketplaceOperatorId();
    if (!operatorId) {
        ctx.logger.warn(`Dispute ${dispute._id.toString()} has no marketplace operator to decide it`);
        return;
    }
    await runAfterCommit(ctx.session ?? undefined, async () => {
        // Roles are tenant data: the operator's admins are read in its own tenant.
        const receiverIds = await withTenant(operatorId, () => companyMemberIdsWithPermission(operatorId, undefined));
        if (!receiverIds.length) return;
        emitNotificationEvent(NotificationEventCodes.DISPUTE_TO_DECIDE, {
            receiverIds,
            payload: {
                companyId: operatorId.toString(),
                languageCode: ctx.languageCode,
                disputeId: dispute._id.toString(),
                orderId: order._id.toString(),
                orderName: order.name,
                companyName: ctx.company.name,
            },
        });
    });
}
