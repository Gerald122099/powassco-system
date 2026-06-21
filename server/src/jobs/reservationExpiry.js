// Auto-expire stale store reservations. A reservation that's still
// "reserved" or "approved" past its 2-day hold was never claimed/paid, so we:
//   • release the on-hold stock back to AVAILABLE, and
//   • mark it "no_show" (counts toward the 2-in-3-months reservation ban).
// Paid (awaiting pickup) reservations are left alone.
import ProductReservation from "../models/ProductReservation.js";
import { ProductLoanCatalog } from "../models/ProductLoan.js";

export async function runReservationExpiry(now = new Date()) {
  const due = await ProductReservation.find({
    status: { $in: ["reserved", "approved"] },
    holdExpiresAt: { $lt: now },
  });
  let expired = 0;
  for (const r of due) {
    try {
      await Promise.all(r.items.map((it) =>
        ProductLoanCatalog.updateOne({ _id: it.productId }, { $inc: { onHold: -it.quantity } })));
      r.status = "no_show";
      r.notes = (r.notes ? r.notes + " | " : "") + "Auto-expired (unclaimed after hold)";
      await r.save();
      expired++;
    } catch (e) {
      console.error("reservation expiry:", r.code, e.message);
    }
  }
  return { expired };
}

export function startReservationExpiryJob() {
  const tick = () => runReservationExpiry().catch((e) => console.error("reservation expiry job:", e.message));
  setTimeout(tick, 60_000);          // shortly after boot
  setInterval(tick, 30 * 60 * 1000); // every 30 minutes
}
