// Product-loan catalogue + per-member applications.
//
// Catalogue items (e.g. water meter, sack of rice) are maintained by the
// bookkeeper. A member application links to a catalogue item, snapshots the
// price, tracks status, and (when released) creates a debit against the
// member's CBU.

import mongoose from "mongoose";

const ProductLoanCatalogSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // "Water meter 1/2 inch"
    // Category drives the default loan-term (frozen 1 week, rice
    // 1 month, etc. — values live in LoanSettings.productTerms).
    // "rental" flips the item into the borrow/return flow and
    // exposes rentFee + isRental on the form.
    category: {
      type: String,
      enum: ["frozen_goods", "rice", "materials", "rental", "appliance", "construction", "other"],
      default: "other",
    },
    unitPrice: { type: Number, required: true, min: 0 }, // sale price (cash-equivalent)
    // Cost basis the co-op paid to source/produce this item.
    // unitPrice − capital = profit per unit. The bookkeeper sets
    // both directly so margins flow through to reports without an
    // extra calculation step.
    capital: { type: Number, default: 0, min: 0 },
    profit: { type: Number, default: 0 },
    stock: { type: Number, default: 0, min: 0 },         // optional inventory
    onHold: { type: Number, default: 0, min: 0 },        // qty reserved (not yet paid) — held off available
    description: { type: String, default: "" },
    imageBase64: { type: String, default: "" },          // small thumbnail (≤ 200KB)
    minCbuRequired: { type: Number, default: 0 },        // bookkeeper eligibility rule
    // Rental-only fields. isRental is convenience for legacy non-
    // enum filters; rentFee is the flat fee charged at borrow time.
    // Late-return penalty is per-day and lives on LoanSettings so
    // it can be tuned globally.
    isRental: { type: Boolean, default: false },
    rentFee: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true }
);
ProductLoanCatalogSchema.index({ name: "text", category: "text" });
ProductLoanCatalogSchema.index({ isActive: 1, category: 1 });

// Per-payment record on a product loan. Sales close at release time
// so they don't accumulate entries here; loans do.
const ProductPaymentSchema = new mongoose.Schema(
  {
    orNo: { type: String, default: "" },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ["cash", "gcash", "bank", "online", "cbu", "other"], default: "cash" },
    paidAt: { type: Date, default: Date.now },
    receivedBy: { type: String, default: "" },
    note: { type: String, default: "" },
  },
  { _id: true }
);

const ProductLoanApplicationSchema = new mongoose.Schema(
  {
    // pnNo + accountName link the transaction to a water member. For
    // walk-in SALES to non-members, pnNo is empty and customerName /
    // customerContact identify the buyer instead. Loans and rentals
    // still require a member because we need a CBU/balance account.
    pnNo: { type: String, index: true, uppercase: true, trim: true, default: "" },
    accountName: { type: String, default: "" },
    customerName: { type: String, default: "" },     // non-member walk-in
    customerContact: { type: String, default: "" },  // optional phone for non-members

    // Three flavours of the same record so reports can roll them up
    // together without joining across tables.
    transactionType: {
      type: String,
      enum: ["sale", "loan", "rental"],
      default: "loan",
      index: true,
    },

    productId: { type: mongoose.Schema.Types.ObjectId, ref: "ProductLoanCatalog", required: true },
    productName: { type: String, required: true },      // snapshot
    productCategory: { type: String, default: "" },     // snapshot
    quantity: { type: Number, default: 1, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },

    // Capital snapshot at the moment of the transaction, so a later
    // price-list edit doesn't retroactively change reported profit.
    unitCapital: { type: Number, default: 0, min: 0 },
    totalCapital: { type: Number, default: 0, min: 0 },
    profitRecorded: { type: Number, default: 0 },  // totalPrice − totalCapital, snapshot

    // Loan / rental term — derived from the product's category at
    // application time using LoanSettings.productTerms.
    termDays: { type: Number, default: 0, min: 0 },
    dueDate: { type: Date },

    // CBU charging — bookkeeper can apply some/all of the cost
    // against the member's CBU at release.
    cbuApplied: { type: Number, default: 0, min: 0 },
    // Remaining balance to amortise (totalPrice + late penalty − cbuApplied − totalPaid).
    balance: { type: Number, default: 0, min: 0 },
    totalPaid: { type: Number, default: 0, min: 0 },
    // Payment history (sub-doc array; small enough to keep inline
    // instead of a separate collection).
    payments: { type: [ProductPaymentSchema], default: [] },

    // Rental-only fields. borrowDate is when the item leaves the
    // co-op; returnDate is the agreed return date. returnedAt is
    // set when the item actually comes back. latePenalty accumulates
    // if returnedAt > returnDate (computed at return time using
    // LoanSettings.productTerms.rentalLatePenaltyPerDay).
    rentFee: { type: Number, default: 0, min: 0 },
    borrowDate: { type: Date },
    returnDate: { type: Date },
    returnedAt: { type: Date },
    latePenalty: { type: Number, default: 0, min: 0 },

    status: {
      type: String,
      enum: ["pending", "approved", "released", "active", "fully_paid", "returned", "overdue", "rejected", "cancelled"],
      default: "pending",
      index: true,
    },
    remarks: { type: String, default: "" },

    appliedAt: { type: Date, default: Date.now },
    approvedAt: { type: Date },
    releasedAt: { type: Date },
    approvedBy: { type: String, default: "" },
    releasedBy: { type: String, default: "" },
  },
  { timestamps: true }
);
ProductLoanApplicationSchema.index({ pnNo: 1, status: 1 });
ProductLoanApplicationSchema.index({ transactionType: 1, status: 1 });
ProductLoanApplicationSchema.index({ status: 1, dueDate: 1 });

export const ProductLoanCatalog = mongoose.model("ProductLoanCatalog", ProductLoanCatalogSchema);
export const ProductLoanApplication = mongoose.model("ProductLoanApplication", ProductLoanApplicationSchema);

export default ProductLoanCatalog;
