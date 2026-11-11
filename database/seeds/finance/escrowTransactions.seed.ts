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
        seedKey: "escrow-logo-hold",
        orderSeedKey: "order-01-logo-completed",
        type: "hold",
        status: "completed",
        gatewayStatus: "ledger_only",
    },
    {
        seedKey: "escrow-logo-release",
        orderSeedKey: "order-01-logo-completed",
        type: "release",
        status: "completed",
        gatewayStatus: "ledger_only",
        recipient: "provider",
    },
    {
        seedKey: "escrow-website-hold",
        orderSeedKey: "order-02-website-pending",
        type: "hold",
        status: "completed",
        gatewayStatus: "ledger_only",
    },
    {
        seedKey: "escrow-website-deposit",
        orderSeedKey: "order-02-website-pending",
        milestoneIndex: 0,
        type: "release",
        status: "completed",
        gatewayStatus: "ledger_only",
        recipient: "provider",
    },
    {
        seedKey: "escrow-mobile-hold",
        orderSeedKey: "order-09-mobile-completed",
        type: "hold",
        status: "completed",
        gatewayStatus: "ledger_only",
    },
    {
        seedKey: "escrow-mobile-proto",
        orderSeedKey: "order-09-mobile-completed",
        milestoneIndex: 0,
        type: "release",
        status: "completed",
        gatewayStatus: "ledger_only",
        recipient: "provider",
    },
    {
        seedKey: "escrow-mobile-beta",
        orderSeedKey: "order-09-mobile-completed",
        milestoneIndex: 1,
        type: "release",
        status: "completed",
        gatewayStatus: "ledger_only",
        recipient: "provider",
    },
    {
        seedKey: "escrow-mobile-store",
        orderSeedKey: "order-09-mobile-completed",
        milestoneIndex: 2,
        type: "release",
        status: "completed",
        gatewayStatus: "ledger_only",
        recipient: "provider",
    },
    {
        seedKey: "escrow-voice-hold",
        orderSeedKey: "order-06-voice-cancelled",
        type: "hold",
        status: "completed",
        gatewayStatus: "ledger_only",
    },
    {
        seedKey: "escrow-voice-refund",
        orderSeedKey: "order-06-voice-cancelled",
        type: "refund",
        status: "completed",
        gatewayStatus: "ledger_only",
        recipient: "customer",
    },
];
