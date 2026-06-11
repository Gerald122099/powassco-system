// Daily-flat penalty engine for water bills.
//
// Coop rule (configurable in Water Settings):
//   • Due date is the dueDayOfMonth of the month AFTER the period.
//   • For each day past due, add `penaltyDailyAmount` (default ₱10).
//   • Sundays are skipped — the cooperative is closed on Sundays so the
//     consumer cannot pay; we therefore do not penalise that day. In effect
//     the grace silently extends by one day for every Sunday that falls
//     inside it.
//   • After `penaltyGraceDays` working days (default 5) elapse without
//     payment, a one-shot `penaltyAfterGraceAmount` (default ₱200) is
//     applied on top and the account is flagged for disconnection.
//
// Example with due = Thu Jan 17, grace = 5 days, daily = 10, after = 200:
//   Fri 18 → ₱10    (1 working day past due)
//   Sat 19 → ₱20    (2)
//   Sun 20 → ₱20    (Sunday skipped)
//   Mon 21 → ₱30    (3)
//   Tue 22 → ₱40    (4)
//   Wed 23 → ₱50    (5 — last grace day)
//   Thu 24 → ₱250   (6 → grace exhausted, +200 disconnection penalty)

const SUNDAY = 0;

// Count working days (skipping Sundays) strictly AFTER `dueDate` up to and
// including `now`. Returns 0 if not past due. Works on calendar days, not
// times — both ends are normalised to midnight.
export function workingDaysSinceDue(dueDate, now = new Date()) {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (today <= due) return 0;

  let count = 0;
  const cursor = new Date(due);
  while (cursor < today) {
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getDay() !== SUNDAY) count++;
  }
  return count;
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Compute the current penalty + disconnection status for a bill against a
// settings doc. Pure function — no side effects on the bill or settings.
export function computeDailyPenalty(dueDate, settings = {}, now = new Date()) {
  const daily = Number(settings.penaltyDailyAmount ?? 10);
  const grace = Math.max(0, Number(settings.penaltyGraceDays ?? 5));
  const after = Number(settings.penaltyAfterGraceAmount ?? 200);

  const days = workingDaysSinceDue(dueDate, now);
  if (days <= 0) {
    return { penalty: 0, daysOverdue: 0, subjectForDisconnection: false, breakdown: "Not past due." };
  }
  if (days <= grace) {
    return {
      penalty: round2(days * daily),
      daysOverdue: days,
      subjectForDisconnection: false,
      breakdown: `${days} working day(s) past due × ₱${daily} = ₱${round2(days * daily)}`,
    };
  }
  return {
    penalty: round2(grace * daily + after),
    daysOverdue: days,
    subjectForDisconnection: true,
    breakdown: `Grace (${grace}d × ₱${daily}) + post-grace ₱${after} = ₱${round2(grace * daily + after)}`,
  };
}

// Brings a bill's penaltyApplied / totalDue / subjectForDisconnection /
// daysOverdue fields up to date against the current calendar day. Used
// by every read path that must show the "live" totalDue (water bill
// officer's bills list, cashier's lookup, public inquiry, etc.) so a
// stale row doesn't lead to under-collection at the counter.
//
//   • No-op on paid bills.
//   • No-op on bills that aren't past due.
//   • Uses the daily-flat engine when penaltyDailyAmount > 0; falls back
//     to the legacy flat/percent rule otherwise.
//   • Persists changes only when something actually moved so we don't
//     hammer Mongo with no-op writes.
export async function freshenBill(bill, { settings, WaterSettings, now = new Date() } = {}) {
  if (!bill) return bill;
  if (bill.status === "paid") return bill;
  const dueDate = bill.dueDate;
  if (!dueDate || new Date(dueDate).getTime() >= new Date(now).getTime()) return bill;

  const s = settings || (WaterSettings ? await WaterSettings.findOne() : {}) || {};
  const useDaily = Number(s.penaltyDailyAmount ?? 0) > 0;

  let penaltyShouldBe = 0;
  let subjectForDisconnection = false;
  let daysOverdue = 0;

  if (useDaily) {
    const r = computeDailyPenalty(dueDate, s, now);
    penaltyShouldBe = round2(r.penalty);
    subjectForDisconnection = r.subjectForDisconnection;
    daysOverdue = r.daysOverdue;
  } else {
    // Legacy: flat amount or percent of base, taken from snapshot on the bill.
    const base = Number(bill.amount || 0);
    const val = Number(bill.penaltyValueUsed || 0);
    const type = bill.penaltyTypeUsed || "flat";
    penaltyShouldBe = round2(Math.max(0, type === "percent" ? base * (val / 100) : val));
  }

  const totalShouldBe = round2(Number(bill.amount || 0) + penaltyShouldBe);
  const targetStatus = "overdue";

  const moved =
    bill.status !== targetStatus ||
    Number(bill.penaltyApplied || 0) !== penaltyShouldBe ||
    Number(bill.totalDue || 0) !== totalShouldBe ||
    !!bill.subjectForDisconnection !== subjectForDisconnection ||
    Number(bill.daysOverdue || 0) !== daysOverdue;

  if (moved) {
    bill.status = targetStatus;
    bill.penaltyApplied = penaltyShouldBe;
    bill.totalDue = totalShouldBe;
    bill.subjectForDisconnection = subjectForDisconnection;
    bill.daysOverdue = daysOverdue;
    bill.penaltyComputedAt = new Date();
    // CONDITIONAL persist (audit fix 2026-06-12): a full .save() here
    // could race the cashier's atomic paid-flip — this freshen loads
    // the bill, the cashier marks it paid, then .save() would write
    // status:"overdue" back over the paid bill. The conditional
    // update only lands while the bill is still unpaid/overdue; if
    // the cashier won, this is a no-op and the in-memory copy is
    // stale for one render, which is harmless.
    if (bill._id && bill.constructor?.updateOne) {
      await bill.constructor.updateOne(
        { _id: bill._id, status: { $ne: "paid" } },
        {
          $set: {
            status: targetStatus,
            penaltyApplied: penaltyShouldBe,
            totalDue: totalShouldBe,
            subjectForDisconnection,
            daysOverdue,
            penaltyComputedAt: bill.penaltyComputedAt,
          },
        }
      );
    } else if (typeof bill.save === "function") {
      await bill.save();
    }
  }
  return bill;
}
