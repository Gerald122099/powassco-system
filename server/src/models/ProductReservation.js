import mongoose from "mongoose";

// A member's product reservation made from the public store. Stock is held
// ON-HOLD on reserve; on cashier payment it converts to a real stock
// deduction. Lifecycle (office approves BEFORE the cashier can collect):
//   reserved → (office verifies/calls) approved → (cashier) paid → (office) picked_up
//   reserved/approved → expired / no_show  (auto after the 2-day hold, if unpaid)
//   any → cancelled
// paymentMethod "savings" means the cashier debits the member's SavingsAccount
// (and logs a SavingsTransaction) instead of taking cash.
const ItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "ProductLoanCatalog", required: true },
    name: { type: String, required: true },        // snapshot
    category: { type: String, default: "" },       // snapshot
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const ProductReservationSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true }, // short human ref e.g. R-3F2A9C
    pnNo: { type: String, required: true, uppercase: true, trim: true, index: true },
    accountName: { type: String, default: "" }, // fetched from the member record
    phone: { type: String, required: true, trim: true },

    items: { type: [ItemSchema], default: [] },
    total: { type: Number, required: true, min: 0 },

    // How the member intends to pay — cash at the cashier, or debit savings.
    paymentMethod: { type: String, enum: ["cash", "savings"], default: "cash" },

    status: {
      type: String,
      enum: ["reserved", "approved", "paid", "picked_up", "cancelled", "expired", "no_show"],
      default: "reserved",
      index: true,
    },

    approvedBy: { type: String, default: "" }, // office staff who verified/approved
    approvedAt: { type: Date },

    // 2-day hold window — after this, an unpaid reservation can be auto-expired
    // (and counted as a no-show for the responsibility rule).
    holdExpiresAt: { type: Date, required: true, index: true },
    // Chosen pickup day (within 2 available days, excl. Sunday).
    pickupDate: { type: Date },

    orNo: { type: String, default: "" },        // set when the cashier collects payment
    paidAt: { type: Date },
    preparedBy: { type: String, default: "" },  // office staff who readied it
    pickedUpAt: { type: Date },
    handledBy: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

ProductReservationSchema.index({ createdAt: -1 });

export default mongoose.model("ProductReservation", ProductReservationSchema);
