import express from "express";

const app = express();

app.get("/api/health", (req, res) => res.json({ ok: true, stage: "health-only" }));

export default app;
