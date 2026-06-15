// Real-time layer: Socket.IO + a MongoDB change stream.
//
// Idea: every write to a watched collection — no matter which route, job,
// webhook, or maintenance script caused it — is picked up by ONE database
// change stream and turned into a lightweight "data:changed" event for a
// topic (e.g. "payments", "water-bills"). Clients that subscribed to that
// topic refetch via the normal authenticated REST API. We never push the
// data itself over the socket, only an invalidation ping, so there's no
// new place for sensitive data to leak and no extra auth surface.
//
// Emits are DEBOUNCED per topic (a bulk write of 50 bills → one ping), and
// the change stream auto-resumes on transient errors. If the deployment
// isn't a replica set (e.g. a standalone local mongod), change streams are
// unsupported and the layer degrades gracefully to "no live updates".

import { Server } from "socket.io";
import jwt from "jsonwebtoken";

let io = null;

// Mongo collection name (lowercased plural) → client topic.
const COLLECTION_TOPIC = {
  waterpayments: "payments",
  loanpayments: "payments",
  onlinepayments: "payments",
  productloanpayments: "payments",
  waterbills: "water-bills",
  waterreadings: "readings",
  loanapplications: "loans",
  productloanapplications: "loans",
  treasurytransactions: "treasury",
  treasuries: "treasury",
  cbutransactions: "cbu",
  savingstransactions: "savings",
  savingsaccounts: "savings",
  payrolls: "payroll",
  expenses: "expenses",
  watermembers: "members",
  servicerequests: "requests",
  memberfeerequests: "requests",
  balanceadjustments: "adjustments",
  announcements: "announcements",
  assets: "assets",
  meetings: "meetings",
};

const ALLOWED_TOPICS = new Set(Object.values(COLLECTION_TOPIC));

export function initRealtime(httpServer, { allowedOrigins, isPreview }) {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const normalized = origin.replace(/\/+$/, "");
        if (allowedOrigins.has(normalized)) return cb(null, true);
        if (isPreview && isPreview(normalized)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
    },
  });

  // Authenticate the socket with the same JWT the REST API uses. Only
  // signed-in staff get live updates (members rely on push + periodic
  // refresh). A bad/expired token is rejected.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || "";
      if (!token) return next(new Error("unauthorized"));
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("subscribe", (topics) => {
      for (const t of [].concat(topics || [])) {
        if (ALLOWED_TOPICS.has(t)) socket.join(`topic:${t}`);
      }
    });
    socket.on("unsubscribe", (topics) => {
      for (const t of [].concat(topics || [])) socket.leave(`topic:${t}`);
    });
    // Progress for long maintenance jobs (e.g. the legacy importer): the
    // client joins a per-run room and receives "job:progress" events.
    socket.on("joinJob", (jobId) => { if (typeof jobId === "string" && jobId) socket.join(`job:${jobId}`); });
    socket.on("leaveJob", (jobId) => { if (typeof jobId === "string" && jobId) socket.leave(`job:${jobId}`); });
  });

  return io;
}

// Debounce emits per topic: the first change schedules one ping ~800ms
// later; further changes inside that window are folded into it.
const pendingTimers = new Map();
export function emitChange(topic, meta = {}) {
  if (!io || !ALLOWED_TOPICS.has(topic)) return;
  if (pendingTimers.has(topic)) return;
  pendingTimers.set(topic, setTimeout(() => {
    pendingTimers.delete(topic);
    io.to(`topic:${topic}`).emit("data:changed", { topic, at: Date.now(), ...meta });
  }, 800));
}

// Emit progress for a long-running job to the client that joined its room.
export function emitJobProgress(jobId, payload = {}) {
  if (!io || !jobId) return;
  io.to(`job:${jobId}`).emit("job:progress", { jobId, ...payload, at: Date.now() });
}

// Start the database-wide change stream. Call after Mongoose connects.
export function startChangeStream(connection) {
  let stream;
  const open = () => {
    try {
      // No fullDocument lookup — we only emit the topic + op type, never
      // the document itself, so there's nothing to fetch.
      stream = connection.watch([]);
      stream.on("change", (change) => {
        const coll = change?.ns?.coll;
        const topic = COLLECTION_TOPIC[coll];
        if (topic) emitChange(topic, { op: change.operationType });
      });
      stream.on("error", (e) => {
        console.error("⚠️  change stream error (will retry):", e.message);
        try { stream.close(); } catch { /* ignore */ }
        setTimeout(open, 5000);
      });
      console.log("✅ Real-time change stream active");
    } catch (e) {
      // Standalone mongod (no replica set) → change streams unsupported.
      console.warn("⚠️  Change streams unavailable (no replica set?). Live updates disabled:", e.message);
    }
  };
  open();
}
