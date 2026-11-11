import EscrowTransaction, {type IEscrowTransaction} from "@financeModule/database/schemas/escrowTransaction/escrowTransaction";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import Currency from "@coreModule/database/schemas/currency/currency";
import Order from "@marketplaceModule/database/schemas/order/order";
import OrderMilestone from "@marketplaceModule/database/schemas/orderMilestone/orderMilestone";
import {demoSeedNameCandidates} from "@coreModule/database/demo/demoSeed";
import {escrowTransactionsSeed} from "@marketplaceModule/database/seeds/finance/escrowTransactions.seed";
import type {HydratedDocument} from "mongoose";
import {toMinor} from "armonia/src/modules/core/helpers/money";
import {decimal128FromMinor} from "@coreModule/utilities/helpers/money";

/**
 * Seeds marketplace escrow holds / releases / refunds.
 *
 * Gateway fields stay empty (`ledger_only`) so no PaymentIntent or client
 * secret is ever committed. Idempotency is `{company, order, type, orderMilestone?}`.
 */
export async function createEscrowTransactions(
    parentLogger: serverLogger,
    company: ICompany,
): Promise<HydratedDocument<IEscrowTransaction>[]> {
    const logger = getLogger("mongoDbInitialization-createEscrowTransactions", parentLogger);
    logger.start(`Creating escrow transactions (${escrowTransactionsSeed.length})...`);

    const created: HydratedDocument<IEscrowTransaction>[] = [];
    const fallbackCurrency = await Currency.findOne({abbreviation: "EUR", company: company._id}).select("_id");

    for (const row of escrowTransactionsSeed) {
        try {
            const order = await Order.findOne({
                company: company._id,
                name: {$in: demoSeedNameCandidates(row.orderSeedKey)},
            }).select("_id amount currency");
            if (!order) {
                logger.warn(
                    `Skipping escrow "${row.seedKey}": marketplace order "${row.orderSeedKey}" was not seeded.`,
                );
                continue;
            }

            let milestoneId: typeof order._id | undefined;
            let amount = row.amount ?? Number(order.amount ?? 0);
            if (row.milestoneIndex !== undefined) {
                const milestone = await OrderMilestone.findOne({
                    company: company._id,
                    order: order._id,
                    orderIndex: row.milestoneIndex,
                }).select("_id amount");
                if (!milestone) {
                    logger.warn(
                        `Skipping escrow "${row.seedKey}": milestone ${row.milestoneIndex} on "${row.orderSeedKey}" was not seeded.`,
                    );
                    continue;
                }
                milestoneId = milestone._id;
                amount = row.amount ?? Number(milestone.amount ?? 0);
            }

            const currency = order.currency ?? fallbackCurrency?._id;
            if (!currency) {
                logger.warn(`Skipping escrow "${row.seedKey}": no currency resolved.`);
                continue;
            }

            const payload = {
                sourceType: "marketplaceOrder" as const,
                sourceId: order._id,
                order: order._id,
                ...(milestoneId ? {orderMilestone: milestoneId} : {}),
                // Stored as Decimal128 (GLB-08); the demo currency has 2 decimals.
                amount: decimal128FromMinor(toMinor(amount)),
                currency,
                type: row.type,
                status: row.status,
                gatewayStatus: row.gatewayStatus,
                ...(row.recipient ? {recipient: row.recipient} : {}),
                company: company._id,
                createdBy: company.createdBy,
            };

            const lookup = {
                company: company._id,
                order: order._id,
                type: row.type,
                ...(milestoneId
                    ? {orderMilestone: milestoneId}
                    : {orderMilestone: {$exists: false}}),
            };

            let existing = await EscrowTransaction.findOne(lookup);
            if (existing) {
                existing.set(payload);
                await existing.save();
            } else {
                existing = await EscrowTransaction.create(payload);
            }
            created.push(existing);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            logger.err(`Error creating escrow "${row.seedKey}": ${message}`);
        }
    }

    logger.finish("Finished creating escrow transactions!", created.length);
    return created;
}
