// Unit tests for the bill-reminder decision logic (pure, no DB).
import { describe, it, expect } from "vitest";
import { decideReminder, _internals } from "./billReminders.js";

const { dayIndexOf, dayIndexYMD } = _internals;

const cfg = {
  dueDayOfMonth: 17,
  graceDays: 0,
  collectionDayOfMonth: 15,
  dueSoonDays: 3,
  collectionLeadDays: 2,
  overdueDaily: true,
};

// A bill for period 2026-05 → due 2026-06-17, collection 2026-06-15.
function bill(extra = {}) {
  return {
    _id: "x",
    pnNo: "ABC123",
    meterNumber: "M1",
    periodKey: "2026-05",
    status: "unpaid",
    totalDue: 480,
    dueDate: new Date("2026-06-17T00:00:00+08:00"),
    createdAt: new Date("2026-06-01T09:00:00+08:00"),
    ...extra,
  };
}
// Manila noon on the given calendar day.
const at = (iso) => new Date(`${iso}T12:00:00+08:00`);
const idx = (iso) => dayIndexOf(at(iso));

const activeMember = { pnNo: "ABC123", accountStatus: "active", meters: [{ meterNumber: "M1", meterStatus: "active" }] };

describe("decideReminder", () => {
  it("announces a fresh bill within the bill_ready window", () => {
    // 2026-06-02 is 1 day after createdAt, well before due/collection windows.
    const d = decideReminder(bill(), activeMember, cfg, idx("2026-06-02"), at("2026-06-02"));
    expect(d?.type).toBe("bill_ready");
  });

  it("fires collection_soon 2 days before collection day", () => {
    const d = decideReminder(bill(), activeMember, cfg, idx("2026-06-13"), at("2026-06-13"));
    expect(d?.type).toBe("collection_soon");
  });

  it("fires due_soon 3 days before the due date", () => {
    const d = decideReminder(bill(), activeMember, cfg, idx("2026-06-14"), at("2026-06-14"));
    expect(d?.type).toBe("due_soon");
  });

  it("fires due_soon on the due date itself", () => {
    const d = decideReminder(bill(), activeMember, cfg, idx("2026-06-17"), at("2026-06-17"));
    expect(d?.type).toBe("due_soon");
    expect(d.body).toMatch(/due today/);
  });

  it("goes overdue the day after due and stays overdue", () => {
    expect(decideReminder(bill(), activeMember, cfg, idx("2026-06-18"), at("2026-06-18"))?.type).toBe("overdue");
    expect(decideReminder(bill(), activeMember, cfg, idx("2026-07-09"), at("2026-07-09"))?.type).toBe("overdue");
  });

  it("stops overdue reminders when the meter is disconnected", () => {
    const m = { pnNo: "ABC123", accountStatus: "active", meters: [{ meterNumber: "M1", meterStatus: "disconnected" }] };
    expect(decideReminder(bill(), m, cfg, idx("2026-06-20"), at("2026-06-20"))).toBeNull();
  });

  it("stops overdue reminders when the account is suspended", () => {
    const m = { pnNo: "ABC123", accountStatus: "suspended", meters: [{ meterNumber: "M1", meterStatus: "active" }] };
    expect(decideReminder(bill(), m, cfg, idx("2026-06-20"), at("2026-06-20"))).toBeNull();
  });

  it("never reminds a paid bill", () => {
    expect(decideReminder(bill({ status: "paid" }), activeMember, cfg, idx("2026-06-18"), at("2026-06-18"))).toBeNull();
  });

  it("is silent on a quiet day (after bill_ready window, before due/collection windows)", () => {
    // 2026-06-08: 7 days post-create (outside bill_ready), collection is 06-15
    // (7 days away, outside lead 2), due 06-17 (outside dueSoon 3).
    expect(decideReminder(bill(), activeMember, cfg, idx("2026-06-08"), at("2026-06-08"))).toBeNull();
  });

  it("prioritizes overdue over collection/due when overlapping", () => {
    // Collection day later than due (collDay 20) so an overdue bill could also
    // be 'collection_soon'; overdue must win.
    const cfg2 = { ...cfg, collectionDayOfMonth: 20 };
    const d = decideReminder(bill(), activeMember, cfg2, idx("2026-06-18"), at("2026-06-18"));
    expect(d?.type).toBe("overdue");
  });

  it("dayIndexYMD and dayIndexOf agree on the same Manila calendar date", () => {
    expect(dayIndexYMD(2026, 6, 17)).toBe(dayIndexOf(at("2026-06-17")));
  });
});
