import express from "express";
import { ProductLoanCatalog } from "../../models/ProductLoan.js";

const router = express.Router();

// Public store catalog — active products with image / price / stock for the
// public Products page. Stock 0 is still returned (shown "Not available" /
// greyed) so members can see the full range. Mounted under /api/public so the
// strict public rate limit applies.
router.get("/", async (req, res) => {
  try {
    const items = await ProductLoanCatalog.find({ isActive: true })
      .select("name category unitPrice stock imageBase64 description isRental rentFee")
      .sort({ category: 1, name: 1 })
      .lean();
    res.json({ items, now: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to load products." });
  }
});

export default router;
