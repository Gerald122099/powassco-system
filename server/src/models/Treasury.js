// Treasury domain — bank registry, bank accounts, the cash vault, the
// unified movement ledger, and the multi-party approval requests that
// gate every balance change.
//
// Money NEVER moves directly: a bookkeeper/cashier files a
// TreasuryRequest, the required approvers sign off IN ORDER, and only
// the final approval applies the movement (atomic $inc, conditional on
// sufficient balance for outflows) + writes TreasuryTransaction rows.

import mongoose from "mongoose";

// Registered bank (admin-managed registry; logo is a small data-URL).
const BankSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    logo: { type: String, default: "" }, // data URL, ≤ ~200KB enforced in route
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
export const Bank = mongoose.model("Bank", BankSchema);

// A real account the coop holds at a registered bank.
const BankAccountSchema = new mongoose.Schema(
  {
    bankId: { type: mongoose.Schema.Types.ObjectId, ref: "Bank", required: true },
    bankName: { type: String, default: "" }, // snapshot for display
    accountName: { type: String, required: true, trim: true },
    accountNumber: { type: String, required: true, trim: true },
    balance: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["active", "closed"], default: "active" },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true }
);
BankAccountSchema.index({ bankId: 1, accountNumber: 1 }, { unique: true });
export const BankAccount = mongoose.model("BankAccount", BankAccountSchema);

// Singleton cash vault.
const CashVaultSchema = new mongoose.Schema(
  { balance: { type: Number, default: 0, min: 0 } },
  { timestamps: true }
);
export const CashVault = mongoose.model("CashVault", CashVaultSchema);

// Movement ledger. target: which pool moved. One request can write two
// rows (e.g. bank_withdraw_to_vault → bank OUT + vault IN).
const TreasuryTransactionSchema = new mongoose.Schema(
  {
    target: { type: String, enum: ["vault", "bank", "drawer"], required: true, index: true },
    bankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "BankAccount", default: null, index: true },
    type: { type: String, enum: ["in", "out"], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    balanceAfter: { type: Number, default: null }, // null for drawer (virtual pool)
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "TreasuryRequest", default: null },
    refNo: { type: String, default: "" }, // bank slip / transaction number
    note: { type: String, default: "" },
    by: { type: String, default: "" },
  },
  { timestamps: true }
);
TreasuryTransactionSchema.index({ createdAt: -1 });
export const TreasuryTransaction = mongoose.model("TreasuryTransaction", TreasuryTransactionSchema);

// Approval matrix per request type. ORDER MATTERS — approvals must be
// collected left to right (operator rule: manager before cashier;
// bookkeeper before cashier).
export const REQUEST_TYPES = {
  bank_initial_balance: { label: "Set opening bank balance", approvers: ["manager"] },
  bank_adjust:          { label: "Bank balance adjustment",  approvers: ["manager"] },
  bank_withdraw_to_vault:{ label: "Bank withdrawal → Cash Vault", approvers: ["manager"] },
  bank_transfer:        { label: "Bank → bank transfer",     approvers: ["manager"] },
  vault_add:            { label: "Add funds to Cash Vault",  approvers: ["manager"] },
  vault_deposit_to_bank:{ label: "Cash Vault → bank deposit", approvers: ["manager", "cashier"] },
  drawer_to_vault:      { label: "Cash drawer → Cash Vault", approvers: ["manager", "bookkeeper"] },
  vault_to_drawer:      { label: "Cash Vault → cash drawer", approvers: ["bookkeeper", "manager"] },
};

const TreasuryRequestSchema = new mongoose.Schema(
  {
    type: { type: String, enum: Object.keys(REQUEST_TYPES), required: true, index: true },
    // bank_adjust only: which way the adjustment moves.
    direction: { type: String, enum: ["in", "out"], default: "in" },
    amount: { type: Number, required: true, min: 0.01 },
    sourceBankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "BankAccount", default: null },
    destBankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "BankAccount", default: null },
    reason: { type: String, required: true, trim: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    requestedBy: { type: String, default: "" },
    requestedByRole: { type: String, default: "" },
    // Approvals collected so far, in order. Next required approver =
    // REQUEST_TYPES[type].approvers[approvals.length].
    approvals: { type: [{ role: String, by: String, at: Date }], default: [] },
    rejectedBy: { type: String, default: "" },
    rejectNote: { type: String, default: "" },
    appliedAt: { type: Date, default: null },
    refNo: { type: String, default: "" }, // filled post-approval for bank ops
  },
  { timestamps: true }
);
TreasuryRequestSchema.index({ status: 1, createdAt: -1 });
export const TreasuryRequest = mongoose.model("TreasuryRequest", TreasuryRequestSchema);
