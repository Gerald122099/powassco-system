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
