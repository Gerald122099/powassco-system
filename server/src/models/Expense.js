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
  },
  { timestamps: true }
);

ExpenseSchema.index({ category: "text", description: "text", payee: "text", reference: "text" });

export default mongoose.model("Expense", ExpenseSchema);
