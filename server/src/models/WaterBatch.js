// server/src/models/WaterBatch.js
import mongoose from "mongoose";

const WaterBatchSchema = new mongoose.Schema(
  {
    batchNumber: { type: String, required: true, unique: true }, // BATCH-001, BATCH-002
    batchName: { type: String, required: true }, // "North Area - Juan"
    readerName: { type: String, required: true },
    readerId: { type: String, required: true },
    area: { type: String, default: "" }, // Geographical area description
    members: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "WaterMember" 
    }],
    meterNumbers: [{ type: String }], // For quick lookup
    isActive: { type: Boolean, default: true },
    createdBy: { type: String, default: "" },
    updatedBy: { type: String, default: "" },
    lastExportedAt: { type: Date },
    lastExportFile: { type: String }, // filename of last export
  },
  { timestamps: true }
);

// Indexes
// NOTE: the previous "unique sparse on members" caused a 500 whenever two
// batches existed with an empty members array (sparse does not exclude
// empty arrays — they collide as a shared empty-set key). Member uniqueness
// across batches is enforced at the application layer in `POST /:id/members`
// (see the otherBatches check below), which is the only correct place to
// reject overlaps anyway.
WaterBatchSchema.index({ members: 1 });

export default mongoose.model("WaterBatch", WaterBatchSchema);