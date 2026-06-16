// Native (Android/iOS) FCM device tokens — the native-app counterpart to
// PushSubscription (which holds browser Web-Push channels). The native
// member app registers its FCM token here with the same `items[]` handle
// list (saved meters / PNs / loans), so the existing reminder + broadcast
// fan-out can reach native devices too.
//
// Like PushSubscription, these are public visitors — no user link.
import mongoose from "mongoose";

const SubscribedHandleSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["pn", "meter", "loan"], required: true },
    value: { type: String, required: true, uppercase: true, trim: true },
  },
  { _id: false }
);

const FcmTokenSchema = new mongoose.Schema(
  {
    // The FCM registration token uniquely identifies the device/app install.
    token: { type: String, required: true, unique: true, index: true },
    items: { type: [SubscribedHandleSchema], default: [] },
    platform: { type: String, enum: ["android", "ios", "web"], default: "android" },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

FcmTokenSchema.index({ "items.kind": 1, "items.value": 1 });

export default mongoose.model("FcmToken", FcmTokenSchema);
