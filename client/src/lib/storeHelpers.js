// Pure helpers for the public store (extracted so they're unit-testable).

// The next 2 pickup days (starting tomorrow), skipping Sundays (closed).
export function pickupOptions(now = new Date()) {
  const out = [];
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  while (out.length < 2) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) out.push(new Date(d)); // 0 = Sunday
  }
  return out;
}

export const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Cart total from [{ p: { unitPrice }, qty }] lines.
export function cartTotal(lines) {
  return (lines || []).reduce((s, l) => s + (Number(l?.p?.unitPrice) || 0) * (Number(l?.qty) || 0), 0);
}

// Clamp a requested quantity to a whole number in [0, max].
export function clampQty(qty, max) {
  return Math.max(0, Math.min(Math.floor(Number(qty) || 0), Math.max(0, Number(max) || 0)));
}
