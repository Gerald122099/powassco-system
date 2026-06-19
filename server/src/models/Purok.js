// Purok registry — the editable list of purok (sub-area) names per
// area/barangay, managed by the meter-reader office. Members are assigned
// to a purok by NAME (WaterMember.purok); this collection is the source of
// truth for the valid names + their display order, so the field readers and
// the office UI can group meters by purok and show per-purok progress.
import mongoose from "mongoose";

const PurokSchema = new mongoose.Schema(
  {
    // Area the purok belongs to — matches WaterMember.address.barangay
    // (e.g. "Looc Sur", "San Miguel", "Owak Proper", "Baybay").
    barangay: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true }, // e.g. "Purok 1"
    // Optional reading-group that bundles several puroks into one route,
    // e.g. "Looc Sur 1" = Puroks 1-3. "" = no group (shown on its own).
    group: { type: String, trim: true, default: "" },
    order: { type: Number, default: 0 },                // display order
    createdBy: { type: String, default: "" },
  },
  { timestamps: true }
);

// One purok name per area.
PurokSchema.index({ barangay: 1, name: 1 }, { unique: true });

export default mongoose.model("Purok", PurokSchema);
