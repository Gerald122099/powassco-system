import express from "express";
import WaterPayment from "../../models/WaterPayment.js";
import WaterBill from "../../models/WaterBill.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin", "water_bill_officer"])];

// GET /api/water/payments?q=&page=&limit=&periodKey=YYYY-MM
router.get("/", ...guard, async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const periodKey = (req.query.periodKey || "").trim();

    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "12", 10)));
    const skip = (page - 1) * limit;

    const filter = {};
    
    // Search filter
    if (q) {
      filter.$or = [
        { pnNo: { $regex: q, $options: "i" } },
        { orNo: { $regex: q, $options: "i" } },
        { "classification": { $regex: q, $options: "i" } },
      ];
    }

    // Period filter: find bills for that period and match payment billIds
    if (periodKey && /^\d{4}-\d{2}$/.test(periodKey)) {
      const [year, month] = periodKey.split('-').map(Number);
      const periodPattern = `${year}-${month.toString().padStart(2, '0')}`;
      
      const bills = await WaterBill.find({ 
        periodCovered: { $regex: `^${periodPattern}` }
      }).select("_id");
      
      if (bills.length > 0) {
        filter.billId = { $in: bills.map((b) => b._id) };
      } else {
        // No bills for this period, return empty
        return res.json({ items: [], total: 0, page, limit });
      }
    }

    const [items, total] = await Promise.all([
      WaterPayment.find(filter)
        .sort({ paidAt: -1 })
        .skip(skip)
        .limit(limit),
      WaterPayment.countDocuments(filter),
    ]);

    res.json({ items, total, page, limit });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ 
      message: "Failed to fetch payments",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// GET payment statistics
router.get("/stats", ...guard, async (req, res) => {
  try {
    const { startDate, endDate, classification } = req.query;
    
    const filter = {};
    
    // Date filter
    if (startDate || endDate) {
      filter.paidAt = {};
      if (startDate) filter.paidAt.$gte = new Date(startDate);
      if (endDate) filter.paidAt.$lte = new Date(endDate);
    }
    
    // Classification filter
    if (classification) {
      filter.classification = classification;
    }
    
    // Get summary statistics
    const stats = await WaterPayment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalPayments: { $sum: 1 },
          totalAmount: { $sum: "$amountPaid" },
          totalDiscount: { $sum: "$discountApplied" },
          totalPenalty: { $sum: "$penaltyApplied" },
          byMethod: { $push: { method: "$method", amount: "$amountPaid" } },
          byClassification: { $push: { classification: "$classification", amount: "$amountPaid" } },
        }
      }
    ]);
    
    // Process grouped data
    const result = {
      totalPayments: 0,
      totalAmount: 0,
      totalDiscount: 0,
      totalPenalty: 0,
      byMethod: {},
      byClassification: {},
    };
    
    if (stats.length > 0) {
      const stat = stats[0];
      result.totalPayments = stat.totalPayments;
      result.totalAmount = stat.totalAmount;
      result.totalDiscount = stat.totalDiscount;
      result.totalPenalty = stat.totalPenalty;
      
      // Process method breakdown
      stat.byMethod.forEach(item => {
        if (!result.byMethod[item.method]) {
          result.byMethod[item.method] = { count: 0, amount: 0 };
        }
        result.byMethod[item.method].count += 1;
        result.byMethod[item.method].amount += item.amount;
      });
      
      // Process classification breakdown
      stat.byClassification.forEach(item => {
        if (!result.byClassification[item.classification]) {
          result.byClassification[item.classification] = { count: 0, amount: 0 };
        }
        result.byClassification[item.classification].count += 1;
        result.byClassification[item.classification].amount += item.amount;
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error("Error fetching payment stats:", error);
    res.status(500).json({ 
      message: "Failed to fetch payment statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

export default router;