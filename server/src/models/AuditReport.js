// A signed audit report. The audit committee reviews a period, then
// "signs" it — we freeze the computed figures into `snapshot` so the
// record reflects exactly what was audited at sign time, even if
// underlying data changes later. Append-only history; never edited.

import mongoose from "mongoose";

const AuditReportSchema = new mongoose.Schema(
  {
    periodFrom: { type: Date, required: true },
    periodTo: { type: Date, required: true },
    label: { type: String, default: "" }, // e.g. "June 2026"
    snapshot: { type: Object, required: true }, // frozen summary figures
    findings: { type: String, default: "" },    // committee notes / remarks
    signedBy: { type: String, required: true },
    signedByRole: { type: String, default: "" },
    signedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
AuditReportSchema.index({ signedAt: -1 });

export default mongoose.model("AuditReport", AuditReportSchema);
