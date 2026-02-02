// server/src/utils/waterPeriod.js

// "2026-01" -> "Jan 2026"
export function periodCoveredLabel(periodKey) {
  if (!/^\d{4}-\d{2}$/.test(periodKey)) return String(periodKey || "");
  const [yy, mm] = periodKey.split("-").map(Number);
  const d = new Date(yy, mm - 1, 1);
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}

// Due date based on periodKey + dueDay + graceDays
// Example: period 2026-01 -> due is in Feb 2026 on dueDay (+ graceDays)
export function computeDueDate(periodKey, dueDayOfMonth = 15, graceDays = 0) {
  if (!/^\d{4}-\d{2}$/.test(periodKey)) throw new Error("Invalid periodKey. Use YYYY-MM.");
  const [yy, mm] = periodKey.split("-").map(Number);

  // next month
  const due = new Date(yy, mm, 1); // month is 0-based; mm is next month already because mm from key is 1-based
  const day = Math.min(31, Math.max(1, Number(dueDayOfMonth || 15)));
  due.setDate(day);

  // clamp to last day of month
  const lastDay = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
  due.setDate(Math.min(due.getDate(), lastDay));

  const g = Math.max(0, Number(graceDays || 0));
  if (g) due.setDate(due.getDate() + g);

  return due;
}

export function isPastDue(dueDate, now = new Date()) {
  return !!dueDate && now.getTime() > new Date(dueDate).getTime();
}

// Helper function for money formatting
export function toMoney(n) {
  return Number((Number(n || 0)).toFixed(2));
}