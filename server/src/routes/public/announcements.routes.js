import express from "express";
import Announcement from "../../models/Announcement.js";

const router = express.Router();

// Published announcements for the public homepage / navbar.
router.get("/", async (req, res) => {
  const items = await Announcement.find({ published: true }).sort({ createdAt: -1 }).limit(20).lean();
  res.json(items);
});

export default router;
