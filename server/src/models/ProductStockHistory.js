// Audit trail for the product catalogue: every time a product is created,
// restocked, or repriced, a row is written here so the bookkeeper/manager can
// see who added what stock (qty, capital, value) and when — separate from the
// sale/loan transaction history.
import mongoose from "mongoose";

const ProductStockHistorySchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "ProductLoanCatalog", index: true },
    productName: { type: String, default: "" },
    category: { type: String, default: "" },
    // created  = new product (quantity = initial stock)
    // stock_in = restock (quantity = units added)
    // reprice  = unitPrice/capital changed
    // edited   = other field change
    action: { type: String, enum: ["created", "stock_in", "reprice", "edited"], required: true, index: true },
    quantity: { type: Number, default: 0 },   // units added (or initial stock)
    unitPrice: { type: Number, default: 0 },   // snapshot at the time
    capital: { type: Number, default: 0 },     // unit capital at the time
    amount: { type: Number, default: 0 },      // capital value of the movement (quantity × capital)
    stockAfter: { type: Number, default: 0 },
    note: { type: String, default: "" },
    by: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ProductStockHistorySchema.index({ createdAt: -1 });
ProductStockHistorySchema.index({ productId: 1, createdAt: -1 });

export default mongoose.model("ProductStockHistory", ProductStockHistorySchema);
