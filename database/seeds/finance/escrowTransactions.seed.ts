import type {
    EscrowGatewayStatus,
    EscrowTransactionStatus,
    EscrowTransactionType,
} from "@financeModule/database/schemas/escrowTransaction/escrowTransaction";

export type EscrowTransactionSeedRow = {
    seedKey: string;
    /** Marketplace Order.name marker via demoSeedName / demoSeedNameCandidates(orderSeedKey). */
    orderSeedKey: string;
    /** Optional milestone `orderIndex` on that order. */
    milestoneIndex?: number;
    type: EscrowTransactionType;
    status: EscrowTransactionStatus;
    gatewayStatus: EscrowGatewayStatus;
    recipient?: "customer" | "provider" | "platform";
    /** When omitted, uses the order (or milestone) amount. */
    amount?: number;
};

/**
 * Marketplace escrow ledger. Amounts default to the parent order / milestone.
 * `gatewayStatus` is always `ledger_only` — no PaymentIntent / client secret.
 */
export const escrowTransactionsSeed: readonly EscrowTransactionSeedRow[] = [
    {
        seedKey: "escrow-renovation-hold",
        orderSeedKey: "order-01-renovation-completed",
        type: "hold",
        status: "completed",
        gatewayStatus: "ledger_only",
    },
    {
        seedKey: "escrow-renovation-release",
        orderSeedKey: "order-01-renovation-completed",
        type: "release",
        status: "completed",
        gatewayStatus: "ledger_only",
        recipient: "provider",
    },
    {
        seedKey: "escrow-bathroom-hold",
        orderSeedKey: "order-02-bathroom-pending",
        type: "hold",
        status: "completed",
        gatewayStatus: "ledger_only",
    },
    {
        seedKey: "escrow-bathroom-deposit",
        orderSeedKey: "order-02-bathroom-pending",
        milestoneIndex: 0,
        type: "release",
        status: "completed",
        gatewayStatus: "ledger_only",
        recipient: "provider",
    },
    {
        seedKey: "escrow-waterproofing-hold",
        orderSeedKey: "order-09-waterproofing-completed",
        type: "hold",
        status: "completed",
        gatewayStatus: "ledger_only",
    },
    {
        seedKey: "escrow-waterproofing-preparation",
        orderSeedKey: "order-09-waterproofing-completed",
        milestoneIndex: 0,
        type: "release",
        status: "completed",
        gatewayStatus: "ledger_only",
        recipient: "provider",
    },
    {
        seedKey: "escrow-waterproofing-membrane",
        orderSeedKey: "order-09-waterproofing-completed",
        milestoneIndex: 1,
        type: "release",
        status: "completed",
        gatewayStatus: "ledger_only",
        recipient: "provider",
    },
    {
        seedKey: "escrow-waterproofing-handover",
        orderSeedKey: "order-09-waterproofing-completed",
        milestoneIndex: 2,
        type: "release",
        status: "completed",
        gatewayStatus: "ledger_only",
        recipient: "provider",
    },
    {
        seedKey: "escrow-plastering-hold",
        orderSeedKey: "order-06-plastering-cancelled",
        type: "hold",
        status: "completed",
        gatewayStatus: "ledger_only",
    },
    {
        seedKey: "escrow-plastering-refund",
        orderSeedKey: "order-06-plastering-cancelled",
        type: "refund",
        status: "completed",
        gatewayStatus: "ledger_only",
        recipient: "customer",
    },
];
