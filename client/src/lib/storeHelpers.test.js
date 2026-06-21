import { describe, it, expect } from "vitest";
import { pickupOptions, ymd, cartTotal, clampQty } from "./storeHelpers";

describe("pickupOptions", () => {
  it("returns the next 2 days and never a Sunday", () => {
    // Wed 2026-06-24 → Thu 25, Fri 26
    const opts = pickupOptions(new Date(2026, 5, 24));
    expect(opts.map(ymd)).toEqual(["2026-06-25", "2026-06-26"]);
    opts.forEach((d) => expect(d.getDay()).not.toBe(0));
  });

  it("skips Sunday in the window", () => {
    // Sat 2026-06-27 → Sun 28 (skip), Mon 29, Tue 30
    const opts = pickupOptions(new Date(2026, 5, 27));
    expect(opts.map(ymd)).toEqual(["2026-06-29", "2026-06-30"]);
  });
});

describe("cartTotal", () => {
  it("sums unitPrice × qty", () => {
    expect(cartTotal([{ p: { unitPrice: 100 }, qty: 2 }, { p: { unitPrice: 50 }, qty: 3 }])).toBe(350);
  });
  it("is 0 for an empty/invalid cart", () => {
    expect(cartTotal([])).toBe(0);
    expect(cartTotal(null)).toBe(0);
  });
});

describe("clampQty", () => {
  it("clamps to [0, max] and floors", () => {
    expect(clampQty(5, 3)).toBe(3);
    expect(clampQty(-2, 10)).toBe(0);
    expect(clampQty(2.9, 10)).toBe(2);
    expect(clampQty(4, 0)).toBe(0);
  });
});
