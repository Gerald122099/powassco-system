import mongoose from "mongoose";

const AnnouncementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, default: "", trim: true },
    image: { type: String, default: "" }, // base64 data URL (optional), client-downscaled
    published: { type: Boolean, default: true },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true }
);

AnnouncementSchema.index({ published: 1, createdAt: -1 });

export default mongoose.model("Announcement", AnnouncementSchema);
