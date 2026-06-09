import { useState } from "react";
import Card from "../../../components/Card";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";
import { Search, CheckCircle2, XCircle, Calculator, Send } from "lucide-react";

function peso(n) {
  return "₱ " + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const inputCls =
  "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";

const emptyPerson = {
  name: "",
  homeAddress: "",
  dateOfBirth: "",
  tin: "",
  telNo: "",
  cellNo: "",
  civilStatus: "",
  dependents: 0,
  spouseName: "",
  contactNo: "",
};

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function PersonCard({ title, p, set }) {
  return (
    <Card>
      <div className="text-sm font-bold text-slate-800">{title}</div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name"><input value={p.name} onChange={(e) => set("name", e.target.value)} className={inputCls} /></Field>
        <Field label="Home Address"><input value={p.homeAddress} onChange={(e) => set("homeAddress", e.target.value)} className={inputCls} /></Field>
        <Field label="Date of Birth"><input value={p.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} placeholder="MM/DD/YYYY" className={inputCls} /></Field>
        <Field label="TIN No."><input value={p.tin} onChange={(e) => set("tin", e.target.value)} className={inputCls} /></Field>
        <Field label="Tel No."><input value={p.telNo} onChange={(e) => set("telNo", e.target.value)} className={inputCls} /></Field>
        <Field label="Cell No."><input value={p.cellNo} onChange={(e) => set("cellNo", e.target.value)} className={inputCls} /></Field>
        <Field label="Civil Status"><input value={p.civilStatus} onChange={(e) => set("civilStatus", e.target.value)} className={inputCls} /></Field>
        <Field label="No. of Dependents"><input type="number" value={p.dependents} onChange={(e) => set("dependents", e.target.value)} className={inputCls} /></Field>
        <Field label="Name of Spouse"><input value={p.spouseName} onChange={(e) => set("spouseName", e.target.value)} className={inputCls} /></Field>
        <Field label="Contact No."><input value={p.contactNo} onChange={(e) => set("contactNo", e.target.value)} className={inputCls} /></Field>
      </div>
    </Card>
  );
}

export default function LoanApplyPanel() {
  const { token } = useAuth();
  const [pnNo, setPnNo] = useState("");
  const [elig, setElig] = useState(null);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    principal: "",
    termMonths: 6,
    modeOfPayment: "monthly",
    collateral: "",
    purpose: "",
    applicant: { ...emptyPerson },
    coMaker: { ...emptyPerson },
    sourceOfIncome: [{ source: "", amount: "", frequency: "monthly" }],
    cooperative: {
      applicant: { shareCapital: 0, savings: 0, loanBalance: 0 },
      coMaker: { shareCapital: 0, savings: 0, loanBalance: 0 },
    },
  });
  const [preview, setPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function set(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }
  function setApplicant(k, v) {
    setForm((p) => ({ ...p, applicant: { ...p.applicant, [k]: v } }));
  }
  function setCoMaker(k, v) {
    setForm((p) => ({ ...p, coMaker: { ...p.coMaker, [k]: v } }));
  }
  function setIncome(i, k, v) {
    setForm((p) => ({ ...p, sourceOfIncome: p.sourceOfIncome.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)) }));
  }
  function addIncome() {
    setForm((p) => ({ ...p, sourceOfIncome: [...p.sourceOfIncome, { source: "", amount: "", frequency: "monthly" }] }));
  }

  async function checkEligibility() {
    setErr("");
    setMsg("");
    setElig(null);
    setPreview(null);
    const pn = pnNo.trim().toUpperCase();
    if (!pn) {
      setErr("Enter a PN No.");
      return;
    }
    setChecking(true);
    try {
      const e = await apiFetch(`/loan/eligibility/${encodeURIComponent(pn)}`, { token });
      setElig(e);
      setForm((p) => ({
        ...p,
        applicant: { ...p.applicant, name: e.member?.accountName || "", homeAddress: e.member?.address || "" },
      }));
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setChecking(false);
    }
  }

  async function calcPreview() {
    setErr("");
    const principal = Number(form.principal || 0);
    if (!(principal > 0)) {
      setErr("Enter the loan amount first.");
      return;
    }
    try {
      const p = await apiFetch("/loan/amortization", {
        method: "POST",
        token,
        body: { principal, termMonths: Number(form.termMonths) || 6 },
      });
      setPreview(p);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function submit() {
    setErr("");
    setMsg("");
    const principal = Number(form.principal || 0);
    if (!elig?.member) {
      setErr("Check a member's PN No first.");
      return;
    }
    if (!(principal > 0)) {
      setErr("Enter the loan amount.");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        borrowerPnNo: elig.member.pnNo,
        borrowerName: form.applicant.name || elig.member.accountName,
        borrowerAddress: form.applicant.homeAddress || elig.member.address,
        principal,
        termMonths: Number(form.termMonths) || 6,
        modeOfPayment: form.modeOfPayment,
        collateral: form.collateral,
        purpose: form.purpose,
        applicant: { ...form.applicant, dependents: Number(form.applicant.dependents) || 0 },
        coMaker: { ...form.coMaker, dependents: Number(form.coMaker.dependents) || 0 },
        sourceOfIncome: form.sourceOfIncome
          .filter((r) => r.source)
          .map((r) => ({ source: r.source, amount: Number(r.amount) || 0, frequency: r.frequency })),
        cooperative: form.cooperative,
      };
      const loan = await apiFetch("/loan/applications", { method: "POST", token, body });
      setMsg(`Loan created: ${loan.loanId} (Ref ${loan.referenceCode}). Net proceeds ${peso(loan.netProceeds)}.`);
      setPreview(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const canApply = !!elig?.eligible;

  return (
    <div className="space-y-4">
      <Card>
        <div className="text-lg font-bold tracking-tight text-slate-900">New Loan Application</div>
        <div className="mt-0.5 text-sm text-slate-500">Enter the member's PN No to check water-bill eligibility.</div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-600">PN No.</label>
            <input
              value={pnNo}
              onChange={(e) => setPnNo(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && checkEligibility()}
              placeholder="PN-001"
              className={inputCls}
            />
          </div>
          <button
            onClick={checkEligibility}
            disabled={checking}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Search size={16} /> {checking ? "Checking…" : "Check Eligibility"}
          </button>
        </div>

        {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>}
        {msg && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{msg}</div>}

        {elig?.member && (
          <div className={`mt-4 rounded-2xl border p-4 ${elig.eligible ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
            <div className="flex items-center gap-2">
              {elig.eligible ? <CheckCircle2 size={18} className="text-emerald-600" /> : <XCircle size={18} className="text-red-600" />}
              <div className="font-bold text-slate-900">{elig.member.accountName}</div>
              <span className="text-xs text-slate-500">PN {elig.member.pnNo}</span>
            </div>
            <div className={`mt-1 text-sm font-medium ${elig.eligible ? "text-emerald-700" : "text-red-700"}`}>{elig.reason}</div>
            {/* CBU snapshot — surfaced from the eligibility endpoint so
                the officer sees the exact balance and the minimum the
                co-op policy requires. */}
            {typeof elig.cbuBalance === "number" && (
              <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-white/60 px-3 py-2 text-sm">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">CBU balance</div>
                  <div className={`font-mono text-lg font-extrabold ${elig.cbuBalance >= (elig.minCbuRequired || 0) ? "text-emerald-700" : "text-red-700"}`}>
                    ₱{Number(elig.cbuBalance).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Minimum required</div>
                  <div className="font-mono text-lg font-extrabold text-slate-800">
                    ₱{Number(elig.minCbuRequired || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {elig?.member && (
        <>
          <Card>
            <div className="text-sm font-bold text-slate-800">Loan Information</div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Amount Applied (₱)">
                <input type="number" min="0" value={form.principal} onChange={(e) => { set("principal", e.target.value); setPreview(null); }} className={inputCls} />
              </Field>
              <Field label="Term (months)">
                <input type="number" min="1" value={form.termMonths} onChange={(e) => { set("termMonths", e.target.value); setPreview(null); }} className={inputCls} />
              </Field>
              <Field label="Mode of Payment">
                <select value={form.modeOfPayment} onChange={(e) => set("modeOfPayment", e.target.value)} className={inputCls}>
                  <option value="monthly">Monthly</option>
                  <option value="semi-monthly">Semi-Monthly</option>
                </select>
              </Field>
              <Field label="Collateral (if any)">
                <input value={form.collateral} onChange={(e) => set("collateral", e.target.value)} className={inputCls} />
              </Field>
              <div className="sm:col-span-2 lg:col-span-4">
                <Field label="Purpose"><input value={form.purpose} onChange={(e) => set("purpose", e.target.value)} className={inputCls} /></Field>
              </div>
            </div>

            <div className="mt-3">
              <button onClick={calcPreview} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100">
                <Calculator size={16} /> Compute amortization
              </button>
            </div>

            {preview && (
              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-xs text-slate-500">Monthly Payment</div>
                  <div className="text-2xl font-bold text-blue-700">{peso(preview.monthlyPayment)}</div>
                  <div className="mt-2 text-xs text-slate-500">Total payable {peso(preview.totalPayment)} • Interest {peso(preview.totalInterest)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-xs text-slate-500">Charges</div>
                  <div className="text-2xl font-bold text-slate-900">{peso(preview.total)}</div>
                  <div className="mt-1 text-xs font-semibold text-emerald-700">Net proceeds {peso(preview.netProceeds)}</div>
                </div>
                <div className="max-h-44 overflow-auto rounded-2xl border border-slate-200 p-4">
                  <div className="mb-1 text-xs font-semibold text-slate-600">Schedule</div>
                  {preview.rows?.map((r) => (
                    <div key={r.period} className="flex justify-between border-b border-slate-100 py-1 text-xs">
                      <span>#{r.period}</span>
                      <span>{peso(r.payment)}</span>
                      <span className="text-slate-400">bal {peso(r.balance)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PersonCard title="Applicant" p={form.applicant} set={setApplicant} />
            <PersonCard title="Co-Maker" p={form.coMaker} set={setCoMaker} />
          </div>

          <Card>
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-slate-800">Source of Income</div>
              <button onClick={addIncome} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">+ Add</button>
            </div>
            <div className="mt-3 space-y-2">
              {form.sourceOfIncome.map((r, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <input value={r.source} onChange={(e) => setIncome(i, "source", e.target.value)} placeholder="Source" className={`col-span-6 ${inputCls}`} />
                  <input type="number" value={r.amount} onChange={(e) => setIncome(i, "amount", e.target.value)} placeholder="Amount" className={`col-span-3 ${inputCls}`} />
                  <select value={r.frequency} onChange={(e) => setIncome(i, "frequency", e.target.value)} className={`col-span-3 ${inputCls}`}>
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="semi-annual">Semi-Annual</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
              ))}
            </div>
          </Card>

          <div className="flex justify-end">
            <button
              onClick={submit}
              disabled={submitting || !canApply}
              title={!canApply ? "Member is not eligible (settle water bills first)" : ""}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Send size={16} /> {submitting ? "Submitting…" : "Submit Application"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
