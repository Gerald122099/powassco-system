import mongoose from "mongoose";

const AuditLogSchema = new mongoose.Schema(
  {
    actorId: { type: String, default: "" },
    actorName: { type: String, default: "" },
    actorRole: { type: String, default: "" },
    method: { type: String, default: "" },
    path: { type: String, default: "" },
    action: { type: String, default: "" }, // human-friendly label
    category: { type: String, default: "general", index: true }, // session | security | general
    // Verb category for the colored badge in the Audit Log panel:
    // insert | update | delete | payment | adjust | approve | reject
    actionKind: { type: String, default: "", index: true },
    statusCode: { type: Number, default: 0 },
    ip: { type: String, default: "" },
    meta: { type: Object },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actorName: 1 });
AuditLogSchema.index({ action: 1 });
// Auto-expire entries after ~120 days to bound growth.
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 120 });

export default mongoose.model("AuditLog", AuditLogSchema);
