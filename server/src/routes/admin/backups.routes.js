import express from "express";
import BackupLog from "../../models/BackupLog.js";
import { createBackup, streamBackupFile, deleteBackup, emailConfigured } from "../../utils/backup.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin"])];
const actor = (req) => req.user?.fullName || req.user?.employeeId || "";

// List recent backups + whether off-site email is configured.
router.get("/", guard, async (req, res) => {
  try {
    const items = await BackupLog.find().sort({ at: -1 }).limit(50).lean();
    res.json({ items, emailConfigured: emailConfigured() });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Run a backup on demand.
router.post("/run", guard, async (req, res) => {
  try {
    const log = await createBackup({ kind: "manual", createdBy: actor(req) });
    res.status(201).json(log);
  } catch (e) {
    await BackupLog.create({ kind: "manual", status: "error", error: e.message, createdBy: actor(req) }).catch(() => {});
    res.status(500).json({ message: e.message });
  }
});

// Download a snapshot (gzipped NDJSON) — the admin's off-site copy.
router.get("/:id/download", guard, async (req, res) => {
  try {
    const log = await BackupLog.findById(req.params.id).lean();
    if (!log || !log.fileId) return res.status(404).json({ message: "Backup not found." });
    res.set("Content-Type", "application/gzip");
    res.set("Content-Disposition", `attachment; filename="${log.filename || "powassco-backup.ndjson.gz"}"`);
    streamBackupFile(log.fileId, res);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete("/:id", guard, async (req, res) => {
  try {
    const log = await BackupLog.findById(req.params.id).lean();
    if (!log) return res.status(404).json({ message: "Backup not found." });
    await deleteBackup(log);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

export default router;
