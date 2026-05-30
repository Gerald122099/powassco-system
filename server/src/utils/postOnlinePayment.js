// Single source of truth for posting a verified online payment to the
// bill/loan. Used by the officer's manual verify AND the PSP webhook
// auto-confirmation. Idempotent: safe to call twice with the same op.

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
      bill.status = "paid";
      bill.paidAt = new Date();
      bill.orNo = orNo;
      await bill.save();
    }
  } else if (op.module === "loan") {
    const loan = await LoanApplication.findById(op.applicationId);
    if (!loan) throw new Error("Loan no longer exists.");
    const amt = op.amountDue;
    await LoanPayment.create({
      loanId: loan.loanId, applicationId: loan._id, borrowerPnNo: loan.borrowerPnNo,
      orNo, method: "online", amountPaid: amt, paidAt: new Date(), receivedBy,
    });
    loan.totalPaid = round2(Number(loan.totalPaid || 0) + amt);
    loan.balance = round2(Math.max(0, Number(loan.totalPayment || 0) - loan.totalPaid));
    if (loan.balance <= 0 && loan.status === "released") loan.status = "closed";
    await loan.save();
  } else {
    throw new Error("Unknown payment module.");
  }

  op.status = "verified";
  op.orNo = orNo;
  op.verifiedBy = receivedBy;
  op.verifiedAt = new Date();
  await op.save();
  return op;
}
