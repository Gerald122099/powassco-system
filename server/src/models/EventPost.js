import mongoose from "mongoose";

// Public events/announcements with photos, formal reactions (no "haha"),
// and a view counter. Created/edited by admin + manager. Each post is
// shareable via /events/:id.
const EventPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    // Up to 5 image data URLs (base64). Served lazily via the image route so
    // the list payload stays light.
    images: { type: [String], default: [] },
    // Formal reaction tallies (haha intentionally excluded).
    reactions: {
      like: { type: Number, default: 0 },
      love: { type: Number, default: 0 },
      celebrate: { type: Number, default: 0 },
      support: { type: Number, default: 0 },
      wow: { type: Number, default: 0 },
      sad: { type: Number, default: 0 },
    },
    views: { type: Number, default: 0 },
    published: { type: Boolean, default: true, index: true },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true }
);

EventPostSchema.index({ createdAt: -1 });

export const EVENT_REACTIONS = ["like", "love", "celebrate", "support", "wow", "sad"];
export default mongoose.model("EventPost", EventPostSchema);
