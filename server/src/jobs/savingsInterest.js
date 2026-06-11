// Savings interest accrual job.
//
// Runs hourly (cheap no-op when not due). When the configured period
// boundary has passed since interestLastRunAt, applies
// interestRatePerPeriod% to every active account's balance:
//   • $inc the balance (atomic)
//   • append a SavingsTransaction (type deposit, INT-... reference)
// so the member's ledger shows the interest line and the public
// Check Balance reflects it.
//
// Guard against double-runs: the settings doc is claimed atomically by
// flipping interestLastRunAt — if two server instances race, only one
// findOneAndUpdate matches the old timestamp.

import SavingsSettings from "../models/SavingsSettings.js";
import SavingsAccount from "../models/SavingsAccount.js";
import SavingsTransaction from "../models/SavingsTransaction.js";

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function periodStart(freq, now = new Date()) {
  if (freq === "monthly") return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(now.getFullYear(), 0, 1); // annually
}

export async function runSavingsInterestIfDue(now = new Date()) {
  const settings = await SavingsSettings.findOne();
  if (!settings) return { ran: false, reason: "no settings" };
  const rate = Number(settings.interestRatePerPeriod) || 0;
  if (rate <= 0) return { ran: false, reason: "rate is 0" };

  const boundary = periodStart(settings.interestFrequency, now);
  const last = settings.interestLastRunAt ? new Date(settings.interestLastRunAt) : null;
  if (last && last >= boundary) return { ran: false, reason: "already ran this period" };

  // Atomic claim — only one process applies interest for this period.
  const claimed = await SavingsSettings.findOneAndUpdate(
    { _id: settings._id, interestLastRunAt: settings.interestLastRunAt },
    { $set: { interestLastRunAt: now } },
    { new: true }
  );
  if (!claimed) return { ran: false, reason: "lost claim race" };

  const accounts = await SavingsAccount.find({ status: "active", balance: { $gt: 0 } }).lean();
  let applied = 0;
  let totalInterest = 0;
  for (const acct of accounts) {
    const interest = round2(Number(acct.balance) * (rate / 100));
    if (!(interest > 0)) continue;
    try {
      const updated = await SavingsAccount.findOneAndUpdate(
        { _id: acct._id, status: "active" },
        { $inc: { balance: interest } },
        { new: true }
      );
      if (!updated) continue;
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
      const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
      await SavingsTransaction.create({
        pnNo: acct.pnNo,
        type: "deposit",
        amount: interest,
        orNo: `INT-${stamp}-${rand}`,
        method: "other",
        receivedBy: "system (interest accrual)",
        balanceAfter: round2(updated.balance),
        paidAt: now,
        note: `${claimed.interestFrequency} interest @ ${rate}% on ₱${round2(acct.balance).toLocaleString()}`,
      });
      applied++;
      totalInterest = round2(totalInterest + interest);
    } catch (e) {
      console.error(`interest accrual failed for ${acct.pnNo}:`, e.message);
    }
  }
  console.log(`💰 Savings interest accrual: ${applied} account(s), ₱${totalInterest} total @ ${rate}%/${claimed.interestFrequency}`);
  return { ran: true, applied, totalInterest };
}

// Hourly tick — call once from index.js after Mongo connects.
export function startSavingsInterestJob() {
  const tick = () => runSavingsInterestIfDue().catch((e) => console.error("interest job:", e.message));
  setTimeout(tick, 30_000); // first check shortly after boot
  setInterval(tick, 60 * 60 * 1000);
}
