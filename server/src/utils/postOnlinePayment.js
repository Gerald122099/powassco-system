// Single source of truth for posting a verified online payment to the
// bill/loan. Used by the officer's manual verify AND the PSP webhook
// auto-confirmation. Idempotent: safe to call twice with the same op.
//
// Concurrency model (audit fix 2026-06-12):
//   • The OnlinePayment op is CLAIMED first via an atomic status flip
//     (pending → verified). PSPs deliver webhooks at-least-once, so two
//     concurrent deliveries of the same event both used to pass the
//     stale `op.status === "pending"` check and double-post. Now only
//     the request that wins the findOneAndUpdate proceeds.
//   • Loan totals use $inc (commutative) instead of read-modify-save,
//     so a concurrent cashier payment on the same loan can't lose an
//     update. Balance + status are recomputed from a fresh read after
//     the $inc — same pattern as cashier.routes.js pay-loan.

import WaterBill from "../models/WaterBill.js";
import WaterPayment from "../models/WaterPayment.js";
import LoanApplication from "../models/LoanApplication.js";
import LoanPayment from "../models/LoanPayment.js";

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export async function postOnlinePayment(op, { orNo, receivedBy = "" }) {
  if (!op) throw new Error("Payment not found.");
  if (op.status === "verified") return op; // already posted — idempotent no-op
  if (op.status !== "pending") throw new Error("Already processed.");
  if (!orNo) throw new Error("OR number is required.");

  // Atomic claim. Whoever flips pending → verified owns the post;
  // every other concurrent caller sees null and returns the
  // already-verified op (idempotent success, not an error).
  const OpModel = op.constructor;
  const claimed = await OpModel.findOneAndUpdate(
    { _id: op._id, status: "pending" },
    { $set: { status: "verified", orNo, verifiedBy: receivedBy, verifiedAt: new Date() } },
    { new: true }
  );
  if (!claimed) {
    const fresh = await OpModel.findById(op._id);
    if (fresh?.status === "verified") return fresh; // lost the race to a twin delivery
    throw new Error("Already processed.");
  }

  try {
    if (op.module === "water") {
      const bill = await WaterBill.findById(op.billId);
      if (!bill) throw new Error("Bill no longer exists.");
      if (bill.status !== "paid") {
        const dupOr = await WaterPayment.findOne({ orNo });
        if (dupOr) {
          const err = new Error(`OR ${orNo} already used.`);
          err.code = "DUP_OR";
          throw err;
        }
        await WaterPayment.create({
          billId: bill._id, pnNo: bill.pnNo, meterNumber: bill.meterNumber, periodKey: bill.periodKey,
          orNo, method: "online", amountPaid: bill.totalDue,
          discountApplied: bill.discount || 0, penaltyApplied: bill.penaltyApplied || 0,
          classification: bill.classification, receivedBy,
          paidAt: new Date(), notes: `Online payment • ref ${op.referenceId}${op.provider ? ` • ${op.provider}` : ""}`,
        });
        // Atomic flip mirrors the cashier path — only an unpaid bill
        // can transition, so a concurrent cashier post can't be
        // overwritten by this save.
        await WaterBill.updateOne(
          { _id: bill._id, status: { $ne: "paid" } },
          { $set: { status: "paid", paidAt: new Date(), orNo } }
        );
      }
    } else if (op.module === "loan") {
      const loan = await LoanApplication.findById(op.applicationId);
      if (!loan) throw new Error("Loan no longer exists.");
      const amt = op.amountDue;
      await LoanPayment.create({
        loanId: loan.loanId, applicationId: loan._id, borrowerPnNo: loan.borrowerPnNo,
        orNo, method: "online", amountPaid: amt, paidAt: new Date(), receivedBy,
      });
      // $inc is commutative — concurrent cashier + online payments on
      // the same loan both land. Balance recomputed from a fresh read.
      await LoanApplication.updateOne({ _id: loan._id }, { $inc: { totalPaid: round2(amt) } });
      const fresh = await LoanApplication.findById(loan._id).select("totalPayment totalPaid status");
      const newBalance = round2(Math.max(0, Number(fresh.totalPayment || 0) - Number(fresh.totalPaid || 0)));
      const setOps = { balance: newBalance };
      if (newBalance <= 0 && fresh.status === "released") setOps.status = "closed";
      await LoanApplication.updateOne({ _id: loan._id }, { $set: setOps });
    } else {
      throw new Error("Unknown payment module.");
    }
  } catch (postErr) {
    // Roll the claim back so a retry (manual or webhook redelivery)
    // can attempt the post again — otherwise the op would be stuck
    // "verified" with no payment behind it.
    await OpModel.updateOne(
      { _id: op._id, status: "verified" },
      { $set: { status: "pending", orNo: "", verifiedBy: "", verifiedAt: null } }
    );
    throw postErr;
  }

  return claimed;
}
