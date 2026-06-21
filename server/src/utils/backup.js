// Database backup: dump every collection to a gzipped NDJSON snapshot stored
// in GridFS (so it survives an accidental collection wipe / bad migration —
// the #1 real-world disaster), then optionally EMAIL it off-site. The admin
// can also download any snapshot and keep it on a drive / Drive (true off-
// site). Runs on the deployed server, which can reach Atlas.
import mongoose from "mongoose";
import zlib from "zlib";
import { GridFSBucket, ObjectId } from "mongodb";
import nodemailer from "nodemailer";
import BackupLog from "../models/BackupLog.js";

const KEEP = 14; // retain the last N snapshots (older ones are pruned)

function bucket() {
  return new GridFSBucket(mongoose.connection.db, { bucketName: "backups" });
}

export function emailConfigured() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS, BACKUP_EMAIL_TO } = process.env;
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS && BACKUP_EMAIL_TO);
}

// Create a snapshot, store it in GridFS, log it, email it (if configured),
// and prune old snapshots. Returns the BackupLog row.
export async function createBackup({ kind = "scheduled", createdBy = "" } = {}) {
  const db = mongoose.connection.db;
  const cols = (await db.listCollections().toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith("system.") && !n.startsWith("backups."))
    .sort();

  const filename = `powassco-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.ndjson.gz`;
  const gzip = zlib.createGzip();
  const upload = bucket().openUploadStream(filename, { contentType: "application/gzip" });
  const uploadDone = new Promise((resolve, reject) => { upload.on("finish", resolve); upload.on("error", reject); });
  gzip.on("error", (e) => upload.destroy(e));
  gzip.pipe(upload);

  // Write one JSON line per doc, with backpressure handling.
  const write = (obj) => new Promise((resolve) => {
    if (gzip.write(JSON.stringify(obj) + "\n")) resolve();
    else gzip.once("drain", resolve);
  });

  let docCount = 0;
  await write({ _meta: { app: "POWASSCO", db: db.databaseName, at: new Date().toISOString(), kind } });
  for (const name of cols) {
    const cursor = db.collection(name).find({});
    for await (const doc of cursor) { await write({ _c: name, d: doc }); docCount += 1; }
  }
  gzip.end();
  await uploadDone;

  const sizeBytes = upload.length || 0;
  const log = await BackupLog.create({
    at: new Date(), kind, fileId: upload.id, filename, sizeBytes,
    collections: cols.length, docCount, createdBy, status: "ok",
  });

  // Off-site email (best-effort — failure here doesn't fail the backup).
  try {
    const to = await emailBackup(filename, upload.id, sizeBytes, docCount);
    if (to) { log.emailed = true; log.emailTo = to; await log.save(); }
  } catch (e) { console.error("backup email failed:", e.message); }

  await prune();
  return log.toObject();
}

async function emailBackup(filename, fileId, sizeBytes, docCount) {
  if (!emailConfigured()) return null;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, BACKUP_EMAIL_TO } = process.env;
  // GridFS → buffer for the attachment.
  const chunks = await streamToChunks(bucket().openDownloadStream(fileId));
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transporter.sendMail({
    from: SMTP_USER,
    to: BACKUP_EMAIL_TO,
    subject: `POWASSCO DB backup ${filename} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB, ${docCount} docs)`,
    text: "Automated POWASSCO database backup attached (gzipped NDJSON). Keep it safe — this is your off-site copy.",
    attachments: [{ filename, content: Buffer.concat(chunks) }],
  });
  return BACKUP_EMAIL_TO;
}

function streamToChunks(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c)).on("end", () => resolve(chunks)).on("error", reject);
  });
}

async function prune() {
  const old = await BackupLog.find().sort({ at: -1 }).skip(KEEP).select("_id fileId").lean();
  for (const b of old) {
    try { if (b.fileId) await bucket().delete(b.fileId); } catch { /* file already gone */ }
    await BackupLog.deleteOne({ _id: b._id });
  }
}

export function streamBackupFile(fileId, res) {
  bucket().openDownloadStream(new ObjectId(String(fileId)))
    .on("error", () => { try { res.status(404).end(); } catch { /* headers sent */ } })
    .pipe(res);
}

export async function deleteBackup(log) {
  try { if (log.fileId) await bucket().delete(new ObjectId(String(log.fileId))); } catch { /* ignore */ }
  await BackupLog.deleteOne({ _id: log._id });
}
