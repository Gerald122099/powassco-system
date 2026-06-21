// Daily database backup. Checks the last scheduled backup's timestamp (not an
// in-memory timer) so it runs at most once per ~day even if the server
// restarts (Render free tier sleeps/restarts).
import BackupLog from "../models/BackupLog.js";
import { createBackup } from "../utils/backup.js";

const DAY_MS = 24 * 60 * 60 * 1000;

async function tick() {
  try {
    const last = await BackupLog.findOne({ kind: "scheduled", status: "ok" }).sort({ at: -1 }).select("at").lean();
    if (last && Date.now() - new Date(last.at).getTime() < 20 * 60 * 60 * 1000) return; // already backed up today
    const log = await createBackup({ kind: "scheduled" });
    console.log(`✅ DB backup: ${log.filename} — ${log.docCount} docs, ${(log.sizeBytes / 1024 / 1024).toFixed(2)} MB${log.emailed ? ` (emailed to ${log.emailTo})` : ""}`);
  } catch (e) {
    console.error("scheduled backup failed:", e.message);
    await BackupLog.create({ kind: "scheduled", status: "error", error: e.message }).catch(() => {});
  }
}

export function startBackupJob() {
  setTimeout(tick, 5 * 60 * 1000);       // ~5 min after boot (first run on fresh deploy)
  setInterval(tick, 6 * 60 * 60 * 1000); // re-check every 6h; the timestamp guard limits it to ~daily
}

export { DAY_MS };
