// Purok management — the meter-reader office defines the purok (sub-area)
// names per area and assigns members to them. Drives the open-pool field
// readers' grouping (all plumbers download all meters, divided by purok)
// and the "unassigned meters" check.
import express from "express";
import Purok from "../../models/Purok.js";
import WaterMember from "../../models/WaterMember.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";

const router = express.Router();
// The office roles that organise field work.
const guard = [requireAuth, requireRole(["admin", "water_bill_officer", "meter_reader"])];

const norm = (s) => String(s || "").trim();

// Overview: every area (barangay) with its puroks + member counts, plus
// how many members in that area are still unassigned.
router.get("/", ...guard, async (req, res) => {
  try {
    const [puroks, counts] = await Promise.all([
      Purok.find({}).sort({ barangay: 1, order: 1, name: 1 }).lean(),
      WaterMember.aggregate([
        { $match: { accountStatus: "active" } },
        { $group: { _id: { barangay: { $ifNull: ["$address.barangay", ""] }, purok: { $ifNull: ["$purok", ""] } }, n: { $sum: 1 } } },
      ]),
    ]);

    const countByKey = new Map(); // `${barangay}__${purok}` -> n
    const areaTotals = new Map(); // barangay -> total members
    const areaUnassigned = new Map();
    for (const c of counts) {
      const b = norm(c._id.barangay), p = norm(c._id.purok);
      countByKey.set(`${b}__${p}`, c.n);
      areaTotals.set(b, (areaTotals.get(b) || 0) + c.n);
      if (!p) areaUnassigned.set(b, (areaUnassigned.get(b) || 0) + c.n);
    }

    // Every area that has members OR a defined purok.
    const areaNames = new Set([...areaTotals.keys(), ...puroks.map((p) => norm(p.barangay))]);
    const areas = [...areaNames].filter(Boolean).sort().map((b) => ({
      barangay: b,
      total: areaTotals.get(b) || 0,
      unassigned: areaUnassigned.get(b) || 0,
      puroks: puroks
        .filter((p) => norm(p.barangay) === b)
        .map((p) => ({ _id: p._id, name: p.name, group: p.group || "", order: p.order, members: countByKey.get(`${b}__${norm(p.name)}`) || 0 })),
    }));
    res.json({ areas });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to load puroks." });
  }
});

// Create a purok in an area.
router.post("/", ...guard, async (req, res) => {
  try {
    const barangay = norm(req.body?.barangay), name = norm(req.body?.name);
    if (!barangay || !name) return res.status(400).json({ error: "barangay and name are required." });
    const order = Number(req.body?.order) || (await Purok.countDocuments({ barangay }));
    const doc = await Purok.create({ barangay, name, group: norm(req.body?.group), order, createdBy: req.user?.fullName || "" });
    res.status(201).json(doc.toObject());
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: "That purok already exists in this area." });
    res.status(500).json({ error: e.message || "Failed to create purok." });
  }
});

// Rename a purok — also re-tags members currently on the old name.
router.patch("/:id", ...guard, async (req, res) => {
  try {
    const name = norm(req.body?.name);
    if (!name) return res.status(400).json({ error: "name is required." });
    const p = await Purok.findById(req.params.id);
    if (!p) return res.status(404).json({ error: "Purok not found." });
    const oldName = p.name;
    if (name !== oldName) {
      await WaterMember.updateMany({ "address.barangay": p.barangay, purok: oldName }, { $set: { purok: name } });
      p.name = name;
    }
    if (req.body?.order !== undefined) p.order = Number(req.body.order) || 0;
    if (req.body?.group !== undefined) p.group = norm(req.body.group);
    await p.save();
    res.json(p.toObject());
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: "That purok name already exists in this area." });
    res.status(500).json({ error: e.message || "Failed to rename purok." });
  }
});

// Set (or clear) the GROUP on many puroks at once — e.g. tag
// "Owak Proper 1" + "Owak Proper 2" both into group "Purok 1".
router.post("/set-group", ...guard, async (req, res) => {
  try {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).filter((x) => /^[a-f0-9]{24}$/i.test(String(x)));
    const group = norm(req.body?.group);
    if (!ids.length) return res.status(400).json({ error: "ids[] required." });
    const r = await Purok.updateMany({ _id: { $in: ids } }, { $set: { group } });
    res.json({ ok: true, updated: r.modifiedCount || 0, group });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to set group." });
  }
});

// Delete a purok — members on it become unassigned.
router.delete("/:id", ...guard, async (req, res) => {
  try {
    const p = await Purok.findById(req.params.id);
    if (!p) return res.status(404).json({ error: "Purok not found." });
    const r = await WaterMember.updateMany({ "address.barangay": p.barangay, purok: p.name }, { $set: { purok: "" } });
    await p.deleteOne();
    res.json({ ok: true, unassigned: r.modifiedCount || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to delete purok." });
  }
});

// Rename or MERGE an area (barangay): retags every member + purok from the
// old name to the new one. Use it to fold stray "Owak" accounts into
// "Owak Proper", fix typos, etc. If `to` already exists the two areas merge.
router.post("/rename-area", ...guard, async (req, res) => {
  try {
    const from = norm(req.body?.from), to = norm(req.body?.to);
    if (!from || !to) return res.status(400).json({ error: "from and to are required." });
    if (from === to) return res.json({ ok: true, members: 0, puroks: 0 });
    const m = await WaterMember.updateMany({ "address.barangay": from }, { $set: { "address.barangay": to } });
    // Move purok registry rows too (skip any that would collide with an
    // existing same-named purok in the target area).
    const targetNames = new Set((await Purok.find({ barangay: to }).select("name").lean()).map((p) => p.name));
    let movedP = 0;
    for (const p of await Purok.find({ barangay: from })) {
      if (targetNames.has(p.name)) { await p.deleteOne(); continue; }
      p.barangay = to; await p.save(); movedP++;
    }
    res.json({ ok: true, members: m.modifiedCount || 0, puroks: movedP });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to rename area." });
  }
});

// Members for the assignment UI: filter by area, purok, unassigned, or search.
router.get("/members", ...guard, async (req, res) => {
  try {
    const { barangay, purok, unassigned, search } = req.query;
    const filter = { accountStatus: "active" };
    if (barangay) filter["address.barangay"] = String(barangay);
    if (unassigned === "1" || unassigned === "true") filter.purok = { $in: ["", null] };
    else if (purok !== undefined) filter.purok = String(purok);
    if (search) {
      const re = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ accountName: re }, { pnNo: re }];
    }
    const members = await WaterMember.find(filter)
      .select("pnNo accountName purok address.barangay address.streetSitioPurok meters")
      .sort({ accountName: 1 })
      .limit(1500)
      .lean();
    res.json(members.map((m) => ({
      pnNo: m.pnNo, accountName: m.accountName, purok: m.purok || "",
      barangay: m.address?.barangay || "", sitio: m.address?.streetSitioPurok || "",
      meters: (m.meters || []).length,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to load members." });
  }
});

// Assign (or clear) the purok for one or many members. purok="" unassigns.
router.post("/assign", ...guard, async (req, res) => {
  try {
    const pnNos = (Array.isArray(req.body?.pnNos) ? req.body.pnNos : [])
      .map((x) => String(x).toUpperCase().trim()).filter(Boolean);
    const purok = norm(req.body?.purok);
    if (!pnNos.length) return res.status(400).json({ error: "pnNos[] is required." });
    const r = await WaterMember.updateMany({ pnNo: { $in: pnNos } }, { $set: { purok } });
    res.json({ ok: true, updated: r.modifiedCount || 0, purok });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to assign purok." });
  }
});

export default router;
