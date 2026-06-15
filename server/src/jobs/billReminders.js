// Water-bill reminder push job.
//
// Runs hourly but does the real pass only once a day, at/after the
// configured local hour (Asia/Manila), claimed atomically via
// WaterSettings.reminderLastRunDate so multiple instances don't double-run.
//
// For every unpaid/overdue bill it decides the single most-urgent
// reminder that applies TODAY and sends one push per subscribed device:
//
//   • bill_ready      — a fresh bill exists (sent once, within a few days
//                       of creation, so a first deploy doesn't flood old bills)
//   • collection_soon — within `collectionLeadDays` of the Collection Day
//   • due_soon        — within `dueSoonDays` of the Due Date
//   • overdue         — past due; repeats DAILY until paid, EXCEPT when the
//                       meter is disconnected or the account is suspended
//
// Priority when several apply on the same day: overdue > due_soon >
// collection_soon > bill_ready. At most one reminder per bill per day,
// enforced by the unique (billId, dateKey) index on ReminderLog.

import WaterSettings from "../models/WaterSettings.js";
import WaterBill from "../models/WaterBill.js";
import WaterMember from "../models/WaterMember.js";
import ReminderLog from "../models/ReminderLog.js";
import { pushToHandles, countDevicesForHandles } from "../utils/push.js";

const MS_PER_DAY = 86_400_000;
const MNL_OFFSET_MS = 8 * 60 * 60 * 1000; // PH is UTC+8, no DST.

// Civil-day index (integer) of an instant, in Manila local time. Two
// instants on the same Manila calendar day share the same index.
function dayIndexOf(date) {
  return Math.floor((date.getTime() + MNL_OFFSET_MS) / MS_PER_DAY);
}
// Civil-day index of a Manila calendar date given as (year, month1based, day).
function dayIndexYMD(y, m1, d) {
  return Math.floor(Date.UTC(y, m1 - 1, d) / MS_PER_DAY);
}
// "YYYY-MM-DD" for an instant, in Manila local time.
function dateKeyOf(date) {
  const shifted = new Date(date.getTime() + MNL_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}
// "M/D/YYYY" label from a civil-day index.
function labelFromIndex(idx) {
  const d = new Date(idx * MS_PER_DAY);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
}
function lastDayOfMonth(y, m1) {
  return new Date(Date.UTC(y, m1, 0)).getUTCDate();
}
function ymPlusOne(periodKey) {
  let [y, m] = String(periodKey).split("-").map(Number);
  m += 1;
  if (m > 12) { m = 1; y += 1; }
  return [y, m];
}
const peso = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Reminders halt for a bill when service is already cut: the meter is
// disconnected, or the whole account is suspended/disconnected.
function serviceCutoff(member, meterNumber) {
  if (!member) return false;
  if (["suspended", "disconnected"].includes(member.accountStatus)) return true;
  const mn = String(meterNumber || "").toUpperCase().trim();
  const meter = (member.meters || []).find((m) => String(m.meterNumber || "").toUpperCase().trim() === mn);
  if (meter && meter.meterStatus === "disconnected") return true;
  return false;
}

// Exported for unit tests (pure date/rule logic).
export const _internals = { dayIndexOf, dayIndexYMD, dateKeyOf, serviceCutoff };

// Decide the single reminder type (or null) for one bill today.
export function decideReminder(bill, member, cfg, todayIdx, now) {
  if (bill.status === "paid") return null;

  // Due-date index: prefer the bill's stored dueDate (already includes the
  // grace it was created with); fall back to a computed one.
  let dueIdx;
  if (bill.dueDate) {
    dueIdx = dayIndexOf(new Date(bill.dueDate));
  } else {
    const [cy, cm] = ymPlusOne(bill.periodKey);
    const day = Math.min(cfg.dueDayOfMonth, lastDayOfMonth(cy, cm));
    dueIdx = dayIndexYMD(cy, cm, day) + (cfg.graceDays || 0);
  }
  const daysUntilDue = dueIdx - todayIdx;

  // Collection-day index (day of the month after the period).
  const [coy, com] = ymPlusOne(bill.periodKey);
  const collDay = Math.min(cfg.collectionDayOfMonth, lastDayOfMonth(coy, com));
  const collIdx = dayIndexYMD(coy, com, collDay);
  const daysUntilColl = collIdx - todayIdx;

  // OVERDUE — past due, keep nagging daily unless service is cut.
  if (daysUntilDue < 0) {
    if (!cfg.overdueDaily) return null;
    if (serviceCutoff(member, bill.meterNumber)) return null;
    return {
      type: "overdue",
      title: "Overdue water bill",
      body: `Your ${bill.periodKey} bill of ${peso(bill.totalDue)} is overdue (due ${labelFromIndex(dueIdx)}). Please pay to avoid disconnection.`,
    };
  }

  // DUE SOON — within the lead window, counting down to the due date.
  if (daysUntilDue >= 0 && daysUntilDue <= cfg.dueSoonDays) {
    const when = daysUntilDue === 0 ? "today" : `in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`;
    return {
      type: "due_soon",
      title: "Water bill due soon",
      body: `Your ${bill.periodKey} bill of ${peso(bill.totalDue)} is due ${when} (${labelFromIndex(dueIdx)}).`,
    };
  }

  // COLLECTION SOON — within the lead window before collection day.
  if (daysUntilColl >= 0 && daysUntilColl <= cfg.collectionLeadDays) {
    const when = daysUntilColl === 0 ? "today" : `in ${daysUntilColl} day${daysUntilColl === 1 ? "" : "s"}`;
    return {
      type: "collection_soon",
      title: "Collection day reminder",
      body: `Collection is ${when} (${labelFromIndex(collIdx)}). Please prepare ${peso(bill.totalDue)} for meter ${bill.meterNumber}.`,
    };
  }

  // BILL READY — a fresh bill, announced once. Window-gated so the first
  // run after deploy doesn't blast every historical unpaid bill.
  if (bill.createdAt) {
    const ageDays = todayIdx - dayIndexOf(new Date(bill.createdAt));
    if (ageDays >= 0 && ageDays <= 2) {
      return {
        type: "bill_ready",
        title: "New water bill",
        body: `Your ${bill.periodKey} water bill is ready: ${peso(bill.totalDue)}, due ${labelFromIndex(dueIdx)}.`,
      };
    }
  }
  return null;
}

/**
 * Run one reminder pass. Pure-ish: with { dry:true } it computes and
 * returns what WOULD be sent without writing logs or sending pushes.
 *
 * @returns { ok, considered, byType, sent, devices, skippedAlreadySent, preview? }
 */
export async function runBillReminders(now = new Date(), { dry = false } = {}) {
  const settings = await WaterSettings.findOne();
  if (!settings) return { ok: false, reason: "no water settings" };
  const r = settings.billReminders || {};
  if (r.enabled === false) return { ok: false, reason: "reminders disabled" };

  const cfg = {
    dueDayOfMonth: settings.dueDayOfMonth || 17,
    graceDays: settings.graceDays || 0,
    collectionDayOfMonth: settings.collectionDayOfMonth || settings.dueDayOfMonth || 17,
    dueSoonDays: r.dueSoonDays ?? 3,
    collectionLeadDays: r.collectionLeadDays ?? 2,
    overdueDaily: r.overdueDaily !== false,
  };

  const todayIdx = dayIndexOf(now);
  const dateKey = dateKeyOf(now);

  const bills = await WaterBill.find({ status: { $in: ["unpaid", "overdue"] } })
    .select("pnNo meterNumber periodKey periodCovered status totalDue dueDate createdAt")
    .lean();
  if (bills.length === 0) return { ok: true, considered: 0, sent: 0, devices: 0, byType: {} };

  // Member status (account suspended / meter disconnected) for the cutoff rule.
  const pnNos = [...new Set(bills.map((b) => b.pnNo))];
  const members = await WaterMember.find({ pnNo: { $in: pnNos } })
    .select("pnNo accountStatus meters.meterNumber meters.meterStatus")
    .lean();
  const memberByPn = new Map(members.map((m) => [m.pnNo, m]));

  const summary = { ok: true, considered: 0, sent: 0, devices: 0, skippedAlreadySent: 0, byType: {}, preview: [] };

  for (const bill of bills) {
    const member = memberByPn.get(bill.pnNo);
    const decision = decideReminder(bill, member, cfg, todayIdx, now);
    if (!decision) continue;

    const handles = [
      { kind: "meter", value: bill.meterNumber },
      { kind: "pn", value: bill.pnNo },
    ];

    if (dry) {
      const devices = await countDevicesForHandles(handles);
      if (devices === 0) continue; // nothing would be sent
      summary.considered += 1;
      summary.byType[decision.type] = (summary.byType[decision.type] || 0) + 1;
      summary.preview.push({
        pnNo: bill.pnNo,
        meterNumber: bill.meterNumber,
        periodKey: bill.periodKey,
        type: decision.type,
        devices,
        body: decision.body,
      });
      continue;
    }

    // Only claim a log row if there's actually a device to notify, so an
    // unsubscribed bill doesn't burn the one-per-day slot.
    const devices = await countDevicesForHandles(handles);
    if (devices === 0) continue;

    // Claim the day (idempotency). Duplicate key => already reminded today.
    try {
      await ReminderLog.create({
        billId: bill._id,
        pnNo: bill.pnNo,
        meterNumber: bill.meterNumber,
        periodKey: bill.periodKey,
        type: decision.type,
        dateKey,
      });
    } catch (e) {
      if (e?.code === 11000) { summary.skippedAlreadySent += 1; continue; }
      console.error("reminder log error:", e.message);
      continue;
    }

    const payload = {
      title: decision.title,
      body: decision.body,
      url: `/inquiry?meter=${encodeURIComponent(bill.meterNumber)}`,
      tag: `bill-${bill.meterNumber}-${bill.periodKey}-${decision.type}`,
    };
    const res = await pushToHandles(handles, payload);
    summary.considered += 1;
    summary.sent += res.sent || 0;
    summary.devices += res.devices || 0;
    summary.byType[decision.type] = (summary.byType[decision.type] || 0) + 1;
    // Record how many devices we actually reached.
    if (res.devices) {
      await ReminderLog.updateOne({ billId: bill._id, dateKey }, { $set: { devicesSent: res.devices } }).catch(() => {});
    }
  }

  if (!dry) {
    console.log(`🔔 Bill reminders ${dateKey}: ${summary.considered} bill(s), ${summary.sent} push(es) to ${summary.devices} device-hit(s)`, summary.byType);
  }
  return summary;
}

/**
 * Hourly gate: run the real pass once per Manila day, at/after sendHour,
 * claimed atomically so two instances can't both run it.
 */
export async function runBillRemindersIfDue(now = new Date()) {
  const settings = await WaterSettings.findOne();
  if (!settings) return { ran: false, reason: "no settings" };
  const r = settings.billReminders || {};
  if (r.enabled === false) return { ran: false, reason: "disabled" };

  const sendHour = r.sendHour ?? 8;
  const localHour = new Date(now.getTime() + MNL_OFFSET_MS).getUTCHours();
  if (localHour < sendHour) return { ran: false, reason: "before send hour" };

  const today = dateKeyOf(now);
  if (settings.reminderLastRunDate === today) return { ran: false, reason: "already ran today" };

  // Atomic claim — only the instance that flips today's date proceeds.
  const claimed = await WaterSettings.findOneAndUpdate(
    { _id: settings._id, reminderLastRunDate: settings.reminderLastRunDate },
    { $set: { reminderLastRunDate: today } },
    { new: true }
  );
  if (!claimed) return { ran: false, reason: "lost claim race" };

  const summary = await runBillReminders(now, { dry: false });
  return { ran: true, ...summary };
}

// Hourly tick — call once from index.js after Mongo connects.
export function startBillReminderJob() {
  const tick = () => runBillRemindersIfDue().catch((e) => console.error("bill reminder job:", e.message));
  setTimeout(tick, 45_000); // first check shortly after boot
  setInterval(tick, 60 * 60 * 1000);
}
