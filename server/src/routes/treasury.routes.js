// Treasury — banks, bank accounts, cash vault, movement ledger, and
// the ordered multi-party approval workflow. See models/Treasury.js
// for the approval matrix.

import express from "express";
import {
  Bank, BankAccount, CashVault, TreasuryTransaction, TreasuryRequest, REQUEST_TYPES,
} from "../models/Treasury.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
const viewGuard = [requireAuth, requireRole(["admin", "manager", "audit_committee", "bookkeeper", "cashier"])];
const adminGuard = [requireAuth, requireRole(["admin"])];
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const who = (req) => req.user?.fullName || req.user?.employeeId || "";
// Admin can stand in for manager in approvals (operator: "manager(admin)").
const roleOf = (req) => req.user?.role === "admin" ? "manager-capable" : req.user?.role;
function canActAs(req, role) {
  return req.user?.role === role || (role === "manager" && req.user?.role === "admin");
}

async function getVault() {
  let v = await CashVault.findOne();
  if (!v) v = await CashVault.create({ balance: 0 });
  return v;
}

// ─── Bank registry (admin) ─────────────────────────────────────────
router.get("/banks", viewGuard, async (req, res) => {
  res.json(await Bank.find({}).sort({ name: 1 }).lean());
});
router.post("/banks", adminGuard, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const logo = String(req.body?.logo || "");
    if (!name) return res.status(400).json({ message: "Bank name is required." });
    if (logo.length > 280000) return res.status(400).json({ message: "Logo too large (200KB max)." });
    const bank = await Bank.create({ name, logo });
    res.status(201).json(bank.toObject());
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ message: "Bank already registered." });
    res.status(500).json({ message: e.message });
  }
});
router.put("/banks/:id", adminGuard, async (req, res) => {
  try {
    const update = {};
    if ("name" in req.body) update.name = String(req.body.name).trim();
    if ("logo" in req.body) {
      if (String(req.body.logo).length > 280000) return res.status(400).json({ message: "Logo too large (200KB max)." });
      update.logo = String(req.body.logo);
    }
    if ("isActive" in req.body) update.isActive = !!req.body.isActive;
    const bank = await Bank.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!bank) return res.status(404).json({ message: "Bank not found." });
    res.json(bank.toObject());
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ─── Accounts + vault overview ─────────────────────────────────────
router.get("/overview", viewGuard, async (req, res) => {
  const [accounts, vault, pending] = await Promise.all([
    BankAccount.find({ status: "active" }).sort({ bankName: 1 }).lean(),
    getVault(),
    TreasuryRequest.find({ status: "pending" }).lean(),
  ]);
  // Which pending requests await THIS user's role next (ordered approvals).
  const myRole = req.user?.role;
  const pendingForMe = pending.filter((r) => {
    const next = REQUEST_TYPES[r.type]?.approvers[r.approvals.length];
    return next && (next === myRole || (next === "manager" && myRole === "admin"));
  }).length;
  res.json({
    accounts,
    vault: { balance: vault.balance },
    pendingTotal: pending.length,
    pendingForMe,
  });
});

// Bookkeeper adds a bank account. Opening balance > 0 auto-files an
// approval request — the cached balance stays 0 until manager approves.
router.post("/accounts", requireAuth, requireRole(["admin", "bookkeeper"]), async (req, res) => {
  try {
    const bank = await Bank.findById(req.body?.bankId);
    if (!bank || !bank.isActive) return res.status(400).json({ message: "Pick a registered bank." });
    const accountName = String(req.body?.accountName || "").trim();
    const accountNumber = String(req.body?.accountNumber || "").trim();
    if (!accountName || !accountNumber) return res.status(400).json({ message: "Account name and number are required." });
    const acct = await BankAccount.create({
      bankId: bank._id, bankName: bank.name, accountName, accountNumber,
      balance: 0, createdBy: who(req),
    });
    let request = null;
    const opening = round2(Number(req.body?.openingBalance || 0));
    if (opening > 0) {
      request = await TreasuryRequest.create({
        type: "bank_initial_balance", amount: opening, destBankAccountId: acct._id,
        reason: `Opening balance for ${bank.name} ${accountNumber}`,
        requestedBy: who(req), requestedByRole: req.user?.role,
      });
    }
    res.status(201).json({ account: acct.toObject(), request });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ message: "That account number already exists for this bank." });
    res.status(500).json({ message: e.message });
  }
});

// ─── Requests ──────────────────────────────────────────────────────
router.get("/requests", viewGuard, async (req, res) => {
  const status = String(req.query.status || "").trim();
  const filter = status ? { status } : {};
  const items = await TreasuryRequest.find(filter).sort({ createdAt: -1 }).limit(200)
    .populate("sourceBankAccountId destBankAccountId", "bankName accountNumber accountName").lean();
  res.json({ items, types: REQUEST_TYPES });
});

router.post("/requests", viewGuard, async (req, res) => {
  try {
    const type = String(req.body?.type || "");
    const spec = REQUEST_TYPES[type];
    if (!spec) return res.status(400).json({ message: "Unknown request type." });
    const amount = round2(Number(req.body?.amount));
    if (!(amount > 0)) return res.status(400).json({ message: "Amount must be > 0." });
    const reason = String(req.body?.reason || "").trim();
    if (!reason) return res.status(400).json({ message: "A reason is required." });

    // Who may FILE each type: cashier files drawer/vault-drawer moves;
    // bookkeeper (or admin) files bank/vault ops; manager/admin can file any.
    const role = req.user?.role;
    const filerOk =
      role === "admin" || role === "manager" ||
      (role === "bookkeeper" && ["bank_initial_balance", "bank_adjust", "bank_withdraw_to_vault", "bank_transfer", "vault_add", "vault_deposit_to_bank"].includes(type)) ||
      (role === "cashier" && ["drawer_to_vault", "vault_to_drawer"].includes(type));
    if (!filerOk) return res.status(403).json({ message: `Your role can't file a ${spec.label} request.` });

    const doc = {
      type, amount, reason,
      direction: req.body?.direction === "out" ? "out" : "in",
      requestedBy: who(req), requestedByRole: role,
    };
    if (["bank_adjust", "bank_withdraw_to_vault", "bank_transfer"].includes(type)) {
      const src = await BankAccount.findById(req.body?.sourceBankAccountId);
      if (!src || src.status !== "active") return res.status(400).json({ message: "Pick a source bank account." });
      doc.sourceBankAccountId = src._id;
    }
    if (["bank_transfer", "vault_deposit_to_bank", "bank_initial_balance"].includes(type)) {
      const dest = await BankAccount.findById(req.body?.destBankAccountId);
      if (!dest || dest.status !== "active") return res.status(400).json({ message: "Pick a destination bank account." });
      doc.destBankAccountId = dest._id;
      if (type === "bank_transfer" && String(doc.sourceBankAccountId) === String(dest._id)) {
        return res.status(400).json({ message: "Source and destination must differ." });
      }
    }
    const created = await TreasuryRequest.create(doc);
    res.status(201).json(created.toObject());
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Apply the movement once the LAST approver signs. Conditional $inc
// keeps outflow pools from going negative even under races.
async function applyRequest(r, actor) {
  const txs = [];
  const note = `${REQUEST_TYPES[r.type].label}: ${r.reason}`;
  const mk = (target, bankAccountId, type, balanceAfter) =>
    TreasuryTransaction.create({ target, bankAccountId, type, amount: r.amount, balanceAfter, requestId: r._id, note, by: actor });

  if (r.type === "bank_initial_balance" || (r.type === "bank_adjust" && r.direction === "in")) {
    const acct = await BankAccount.findOneAndUpdate({ _id: r.destBankAccountId || r.sourceBankAccountId }, { $inc: { balance: r.amount } }, { new: true });
    if (!acct) throw new Error("Bank account no longer exists.");
    txs.push(await mk("bank", acct._id, "in", round2(acct.balance)));
  } else if (r.type === "bank_adjust" && r.direction === "out") {
    const acct = await BankAccount.findOneAndUpdate({ _id: r.sourceBankAccountId, balance: { $gte: r.amount } }, { $inc: { balance: -r.amount } }, { new: true });
    if (!acct) throw new Error("Insufficient bank balance for this adjustment.");
    txs.push(await mk("bank", acct._id, "out", round2(acct.balance)));
  } else if (r.type === "bank_withdraw_to_vault") {
    const acct = await BankAccount.findOneAndUpdate({ _id: r.sourceBankAccountId, balance: { $gte: r.amount } }, { $inc: { balance: -r.amount } }, { new: true });
    if (!acct) throw new Error("Insufficient bank balance.");
    const vault = await CashVault.findOneAndUpdate({}, { $inc: { balance: r.amount } }, { new: true, upsert: true });
    txs.push(await mk("bank", acct._id, "out", round2(acct.balance)));
    txs.push(await mk("vault", null, "in", round2(vault.balance)));
  } else if (r.type === "bank_transfer") {
    const src = await BankAccount.findOneAndUpdate({ _id: r.sourceBankAccountId, balance: { $gte: r.amount } }, { $inc: { balance: -r.amount } }, { new: true });
    if (!src) throw new Error("Insufficient balance in the source account.");
    const dest = await BankAccount.findOneAndUpdate({ _id: r.destBankAccountId }, { $inc: { balance: r.amount } }, { new: true });
    if (!dest) {
      await BankAccount.updateOne({ _id: src._id }, { $inc: { balance: r.amount } }); // roll back
      throw new Error("Destination account no longer exists.");
    }
    txs.push(await mk("bank", src._id, "out", round2(src.balance)));
    txs.push(await mk("bank", dest._id, "in", round2(dest.balance)));
  } else if (r.type === "vault_add") {
    const vault = await CashVault.findOneAndUpdate({}, { $inc: { balance: r.amount } }, { new: true, upsert: true });
    txs.push(await mk("vault", null, "in", round2(vault.balance)));
  } else if (r.type === "vault_deposit_to_bank") {
    const vault = await CashVault.findOneAndUpdate({ balance: { $gte: r.amount } }, { $inc: { balance: -r.amount } }, { new: true });
    if (!vault) throw new Error("Insufficient Cash Vault balance.");
    const dest = await BankAccount.findOneAndUpdate({ _id: r.destBankAccountId }, { $inc: { balance: r.amount } }, { new: true });
    if (!dest) {
      await CashVault.updateOne({}, { $inc: { balance: r.amount } });
      throw new Error("Destination account no longer exists.");
    }
    txs.push(await mk("vault", null, "out", round2(vault.balance)));
    txs.push(await mk("bank", dest._id, "in", round2(dest.balance)));
  } else if (r.type === "drawer_to_vault") {
    const vault = await CashVault.findOneAndUpdate({}, { $inc: { balance: r.amount } }, { new: true, upsert: true });
    txs.push(await mk("drawer", null, "out", null));
    txs.push(await mk("vault", null, "in", round2(vault.balance)));
  } else if (r.type === "vault_to_drawer") {
    const vault = await CashVault.findOneAndUpdate({ balance: { $gte: r.amount } }, { $inc: { balance: -r.amount } }, { new: true });
    if (!vault) throw new Error("Insufficient Cash Vault balance.");
    txs.push(await mk("vault", null, "out", round2(vault.balance)));
    txs.push(await mk("drawer", null, "in", null));
  }
  return txs;
}

router.post("/requests/:id/approve", viewGuard, async (req, res) => {
  try {
    const r = await TreasuryRequest.findById(req.params.id);
    if (!r || r.status !== "pending") return res.status(409).json({ message: "Request is not pending." });
    const next = REQUEST_TYPES[r.type].approvers[r.approvals.length];
    if (!next) return res.status(409).json({ message: "Already fully approved." });
    if (!canActAs(req, next)) {
      return res.status(403).json({ message: `Awaiting ${next} approval first (ordered sign-off).` });
    }
    // Atomic claim on the approvals length so two same-role approvers
    // can't double-sign the same slot.
    const claimed = await TreasuryRequest.findOneAndUpdate(
      { _id: r._id, status: "pending", [`approvals.${r.approvals.length}`]: { $exists: false } },
      { $push: { approvals: { role: next, by: who(req), at: new Date() } } },
      { new: true }
    );
    if (!claimed) return res.status(409).json({ message: "Someone else just signed this slot — reload." });

    const done = claimed.approvals.length >= REQUEST_TYPES[r.type].approvers.length;
    if (!done) return res.json(claimed.toObject());

    try {
      await applyRequest(claimed, who(req));
    } catch (applyErr) {
      // Roll the signature back so the request stays actionable.
      await TreasuryRequest.updateOne({ _id: claimed._id }, { $pop: { approvals: 1 } });
      return res.status(400).json({ message: applyErr.message });
    }
    claimed.status = "approved";
    claimed.appliedAt = new Date();
    await claimed.save();
    res.json(claimed.toObject());
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post("/requests/:id/reject", viewGuard, async (req, res) => {
  const r = await TreasuryRequest.findById(req.params.id);
  if (!r || r.status !== "pending") return res.status(409).json({ message: "Request is not pending." });
  const next = REQUEST_TYPES[r.type].approvers[r.approvals.length];
  if (!canActAs(req, next)) return res.status(403).json({ message: `Only the pending ${next} approver can reject.` });
  r.status = "rejected";
  r.rejectedBy = who(req);
  r.rejectNote = String(req.body?.note || "").trim();
  await r.save();
  res.json(r.toObject());
});

// Reference / slip number recorded AFTER approval (bank operations).
router.patch("/requests/:id/ref", requireAuth, requireRole(["admin", "manager", "bookkeeper"]), async (req, res) => {
  const refNo = String(req.body?.refNo || "").trim();
  if (!refNo) return res.status(400).json({ message: "Reference number is required." });
  const r = await TreasuryRequest.findOneAndUpdate(
    { _id: req.params.id, status: "approved" },
    { $set: { refNo } },
    { new: true }
  );
  if (!r) return res.status(409).json({ message: "Only approved requests take a reference number." });
  await TreasuryTransaction.updateMany({ requestId: r._id }, { $set: { refNo } });
  res.json(r.toObject());
});

// ─── Ledger ────────────────────────────────────────────────────────
router.get("/transactions", viewGuard, async (req, res) => {
  const filter = {};
  if (req.query.target) filter.target = String(req.query.target);
  if (req.query.bankAccountId) filter.bankAccountId = String(req.query.bankAccountId);
  const items = await TreasuryTransaction.find(filter).sort({ createdAt: -1 }).limit(300)
    .populate("bankAccountId", "bankName accountNumber").lean();
  res.json({ items });
});

export default router;
