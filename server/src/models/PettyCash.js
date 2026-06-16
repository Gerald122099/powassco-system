// Petty cash — a small imprest fund the cashier holds for minor cash
// expenses. Self-contained ledger: "replenish" adds money to the fund,
// "voucher" spends it. The running balance is computed from the non-voided
// rows, so it never drifts. Kept separate from the main cash-drawer
// reconciliation (an imprest box), so it doesn't touch that math.
import mongoose from "mongoose";

// Seed categories for the voucher dropdown (free text is still allowed).
export const PETTY_CASH_CATEGORIES = [
  "Office Supplies",
  "Fuel / Transportation",
  "Load / Communication",
  "Meals / Refreshments",
  "Repairs / Maintenance",
  "Postage / Documents",
  "Miscellaneous",
];

const PettyCashSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now, index: true },
    // replenish = cash INTO the fund; voucher = cash OUT for an expense.
    type: { type: String, enum: ["replenish", "voucher"], required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, default: "", trim: true },     // vouchers only
    description: { type: String, default: "", trim: true },
    payee: { type: String, default: "", trim: true },
    reference: { type: String, default: "", trim: true },    // voucher / OR no.
    recordedBy: { type: String, default: "" },
    // Soft-void so the running balance can ignore mistakes without
    // renumbering history.
    voided: { type: Boolean, default: false, index: true },
    voidedBy: { type: String, default: "" },
    voidedAt: { type: Date, default: null },
    voidReason: { type: String, default: "" },
  },
  { timestamps: true }
);

PettyCashSchema.index({ category: "text", description: "text", payee: "text", reference: "text" });

export default mongoose.model("PettyCash", PettyCashSchema);
