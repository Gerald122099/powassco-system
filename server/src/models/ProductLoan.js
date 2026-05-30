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
    category: { type: String, default: "" },             // "appliance", "rice", "construction"
    unitPrice: { type: Number, required: true, min: 0 }, // cash-equivalent
    stock: { type: Number, default: 0, min: 0 },         // optional inventory
    description: { type: String, default: "" },
    imageBase64: { type: String, default: "" },          // small thumbnail (≤ 200KB)
    minCbuRequired: { type: Number, default: 0 },        // bookkeeper eligibility rule
    isActive: { type: Boolean, default: true },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true }
);
ProductLoanCatalogSchema.index({ name: "text", category: "text" });

const ProductLoanApplicationSchema = new mongoose.Schema(
  {
    pnNo: { type: String, required: true, index: true, uppercase: true, trim: true },
    accountName: { type: String, default: "" },

    productId: { type: mongoose.Schema.Types.ObjectId, ref: "ProductLoanCatalog", required: true },
    productName: { type: String, required: true },      // snapshot
    productCategory: { type: String, default: "" },     // snapshot
    quantity: { type: Number, default: 1, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },

    // How much of the cost was charged against the member's CBU at release.
    cbuApplied: { type: Number, default: 0, min: 0 },
    // Remaining balance to amortise (totalPrice - cbuApplied).
    balance: { type: Number, default: 0, min: 0 },

    status: {
      type: String,
      enum: ["pending", "approved", "released", "fully_paid", "rejected"],
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

export const ProductLoanCatalog = mongoose.model("ProductLoanCatalog", ProductLoanCatalogSchema);
export const ProductLoanApplication = mongoose.model("ProductLoanApplication", ProductLoanApplicationSchema);

export default ProductLoanCatalog;
