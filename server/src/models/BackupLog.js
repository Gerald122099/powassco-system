import mongoose from "mongoose";

// Record of each database backup. The gzipped snapshot itself is stored in
// GridFS (bucket "backups"); this row is the lightweight index + status.
const BackupLogSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now, index: true },
    kind: { type: String, enum: ["scheduled", "manual"], default: "scheduled" },
    fileId: { type: mongoose.Schema.Types.ObjectId }, // GridFS file _id
    filename: { type: String, default: "" },
    sizeBytes: { type: Number, default: 0 },
    collections: { type: Number, default: 0 }, // collections included
    docCount: { type: Number, default: 0 },     // total documents
    emailed: { type: Boolean, default: false },
    emailTo: { type: String, default: "" },
    status: { type: String, enum: ["ok", "error"], default: "ok" },
    error: { type: String, default: "" },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("BackupLog", BackupLogSchema);
