import { periodLabelFromKey } from "./waterPeriod.js";

export function computeWaterDueDate(periodKey, dueDayOfMonth = 15, graceDays = 0) {
  // due date = (period month) + dueDayOfMonth + graceDays
  const [y, m] = periodKey.split("-").map(Number);
  const year = y;
  const monthIndex = (m || 1) - 1;

  const day = Math.min(31, Math.max(1, Number(dueDayOfMonth || 15)));
  const grace = Math.min(60, Math.max(0, Number(graceDays || 0)));

  // base due date
  const due = new Date(year, monthIndex, day);
  due.setDate(due.getDate() + grace);
  return due;
}

export function computeWaterPenalty(amount, settings) {
  const base = Number(amount || 0);
  const penaltyType = settings?.penaltyType || "flat";
  const penaltyValue = Number(settings?.penaltyValue || 0);

  let penalty = 0;
  if (penaltyType === "percent") penalty = base * (penaltyValue / 100);
  else penalty = penaltyValue;

  penalty = Math.max(0, Number(penalty.toFixed(2)));
  return penalty;
}

export function waterIsPastDue(bill, now = new Date()) {
  if (!bill?.dueDate) return false;
  return now.getTime() > new Date(bill.dueDate).getTime();
}

export function billPeriodLabel(periodKey) {
  return periodLabelFromKey(periodKey);
}
