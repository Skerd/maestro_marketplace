import {objectIds as ids, registerPersonEraser, type ErasureContext, type ErasureCount} from "@coreModule/utilities/erasure/personErasure";
import {orderService} from "@marketplaceModule/database/schemas/order/order.service";

/**
 * A marketplace's records of one person (D57): a service order they bought stays for accounting, and loses the note
 * they wrote on it. The link to their login account stays: the account itself is removed by the separate account
 * deletion.
 */
async function eraseMarketplacePerson(ctx: ErasureContext): Promise<ErasureCount[]> {
    const {companyId, subject, preview, session} = ctx;
    const orders = await orderService.find(
        {company: companyId, customer: {$in: subject.accountIds}, note: {$exists: true}},
        {session, withDeleted: true},
        undefined,
        "_id",
    );
    const counts: ErasureCount[] = [{collection: "orders", anonymised: orders.length, deleted: 0}];
    if (preview) return counts;

    if (orders.length > 0) {
        await orderService.eraseFields({company: companyId, _id: {$in: ids(orders)}}, {$unset: {note: ""}}, {session});
        ctx.scrubAudit("orders", ids(orders), ["note"]);
    }
    return counts;
}

export function registerMarketplacePersonErasers(): void {
    registerPersonEraser({module: "marketplace", erase: eraseMarketplacePerson});
}
