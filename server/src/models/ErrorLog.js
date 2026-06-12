// System error log — every 5xx response is captured here so the admin
// can see what broke, who hit it, and record what was done about it.

import mongoose from "mongoose";

const ErrorLogSchema = new mongoose.Schema(
  {
    method: { type: String, default: "" },
    path: { type: String, default: "" },
    statusCode: { type: Number, default: 500 },
    actorName: { type: String, default: "" },
    actorRole: { type: String, default: "" },
    ip: { type: String, default: "" },
    meta: { type: Object }, // sanitized request body
    status: { type: String, enum: ["open", "resolved"], default: "open", index: true },
    resolution: { type: String, default: "" }, // action taken / root cause
    resolvedBy: { type: String, default: "" },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
ErrorLogSchema.index({ createdAt: -1 });
// Expire after 180 days to bound growth.
ErrorLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export default mongoose.model("ErrorLog", ErrorLogSchema);
