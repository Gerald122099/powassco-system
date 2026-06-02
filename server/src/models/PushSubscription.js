// Web Push subscriptions stored per device. Endpoint is the unique
// identifier of the device's push channel (Chrome / Firefox / Edge each
// expose their own FCM / Mozilla endpoint URL). One subscription doc
// per device; the `items` list is the set of handles the user said
// they want notifications for (their saved meters / PNs / loans).
//
// We never persist a "user" link on this collection — these are public
// visitors, not authenticated users.
import mongoose from "mongoose";

const SubscribedHandleSchema = new mongoose.Schema(
  {
    // 'pn' (water account), 'meter' (single meter), or 'loan'.
    kind: { type: String, enum: ["pn", "meter", "loan"], required: true },
    value: { type: String, required: true, uppercase: true, trim: true },
  },
  { _id: false }
);

const PushSubscriptionSchema = new mongoose.Schema(
  {
    endpoint: { type: String, required: true, unique: true, index: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    items: { type: [SubscribedHandleSchema], default: [] },
    userAgent: { type: String, default: "" },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Allow looking up "all subscriptions that care about this handle".
PushSubscriptionSchema.index({ "items.kind": 1, "items.value": 1 });

export default mongoose.model("PushSubscription", PushSubscriptionSchema);
