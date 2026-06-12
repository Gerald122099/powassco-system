import mongoose from "mongoose";

// Common categories for the cooperative (used to seed the UI dropdown).
// `category` itself is a free string so admins can add their own.
export const EXPENSE_CATEGORIES = [
  "Pipe Repair / Maintenance",
  "Utilities (Electricity / Water / Internet)",
  "Office Supplies",
  "Fuel / Transportation",
  "Equipment / Tools",
  "Professional Fees",
  "Permits / Licenses",
  "Salaries / Payroll",
  "Product Supply Capital",
  "Miscellaneous",
];

const ExpenseSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now, index: true },
    category: { type: String, required: true, trim: true, index: true },
    description: { type: String, default: "", trim: true },
    payee: { type: String, default: "", trim: true }, // vendor / paid to
    amount: { type: Number, required: true, min: 0 },
    reference: { type: String, default: "", trim: true }, // OR / invoice no.
    paymentMethod: { type: String, enum: ["cash", "check", "bank", "gcash", "other"], default: "cash" },
    notes: { type: String, default: "", trim: true },
    recordedBy: { type: String, default: "" },

    // Request / approve / disburse workflow (added 2026-06-12).
    //   pending   — admin/manager filed a request; awaits cashier action
    //   approved  — admin/manager approved; awaits cashier disbursement
    //   disbursed — cashier paid cash out and recorded the OR / DV
    //   rejected  — admin/manager declined; no cash moves
    // Legacy rows (no status set) are treated as already-disbursed by
    // the read paths so this is backwards-compatible.
    status: {
      type: String,
      enum: ["pending", "approved", "disbursed", "rejected"],
      default: "disbursed",
      index: true,
    },
    requestedBy: { type: String, default: "" },
    approvedBy: { type: String, default: "" },
    approvedAt: { type: Date, default: null },
    disbursedBy: { type: String, default: "" }, // cashier name
    disbursedAt: { type: Date, default: null },
    disbursementOr: { type: String, default: "", trim: true }, // OR / DV no.
    // Bank/cheque disbursements: which coop account the money left.
    bankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "BankAccount", default: null },
    disbursedBank: { type: String, default: "" }, // "BankName ····1234" snapshot
    rejectedBy: { type: String, default: "" },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: "" },
  },
  { timestamps: true }
);

ExpenseSchema.index({ category: "text", description: "text", payee: "text", reference: "text" });

export default mongoose.model("Expense", ExpenseSchema);
