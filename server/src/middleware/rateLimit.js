const hits = new Map(); // key -> { count, resetAt }

export function simpleRateLimit({ windowMs = 60_000, max = 20 } = {}) {
  return (req, res, next) => {
    const ip = req.headers["x-forwarded-for"]?.toString()?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    let entry = hits.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }

    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({ message: "Too many attempts. Please try again later." });
    }

    next();
  };
}
