import { useState } from "react";
import Navbar from "../../components/Navbar";
import { apiFetch } from "../../lib/api";
import { Droplet, PlugZap, CheckCircle2, MessageSquare } from "lucide-react";

// Concern categories shown in the Concern / Feedback form (Reconnection is
// included here too, per request). Stored verbatim as the concern type.
const CONCERN_TYPES = [
  "Billing concern",
  "No water / low pressure",
  "Water quality",
  "Leak / pipe damage",
  "Reconnection",
  "Meter problem",
  "Staff / service feedback",
  "Suggestion",
  "Other",
];

const inputCls =
  "mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400";

function Field({ label, children, required }) {
  return (
    <div>
      <label className="text-sm font-semibold text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

const EMPTY = {
  fullName: "",
  phone: "",
  email: "",
  address: "",
  installationType: "residential",
  accountNumber: "",
  meterNumber: "",
  concernType: CONCERN_TYPES[0],
  message: "",
};

export default function ContactPage() {
  const [tab, setTab] = useState("new_connection");
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!form.fullName.trim() || !form.phone.trim()) { setErr("Name and contact number are required."); return; }
    if (tab === "concern" && !form.message.trim()) { setErr("Please describe your concern or feedback."); return; }
    setBusy(true);
    try {
      let body;
      if (tab === "new_connection") {
        body = {
          type: "new_connection",
          fullName: form.fullName,
          phone: form.phone,
          email: form.email,
          address: form.address,
          installationType: form.installationType,
          message: form.message,
        };
      } else if (tab === "reconnection") {
        body = {
          type: "reconnection",
          fullName: form.fullName,
          phone: form.phone,
          accountNumber: form.accountNumber,
          meterNumber: form.meterNumber,
          message: form.message,
        };
      } else {
        body = {
          type: "concern",
          fullName: form.fullName,
          phone: form.phone,
          concernType: form.concernType,
          accountNumber: form.accountNumber, // optional
          message: form.message,
        };
      }
      const res = await apiFetch("/public/requests", { method: "POST", body });
      setDone(res.message || "Request submitted. We'll contact you.");
      setForm(EMPTY);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100 px-4 pb-16 pt-24">
        <div className="mx-auto max-w-2xl">
          <div className="text-center">
            <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">Contact Us</h1>
            <p className="mt-2 text-sm text-slate-500">
              Apply for a new connection, request a reconnection, or send a concern / feedback. We'll call the number you provide.
            </p>
          </div>

          {done ? (
            <div className="mt-8 rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
              <CheckCircle2 className="mx-auto text-emerald-500" size={48} />
              <div className="mt-3 text-lg font-bold text-slate-900">Thank you!</div>
              <p className="mt-1 text-sm text-slate-600">{done}</p>
              <button
                onClick={() => setDone("")}
                className="mt-5 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold hover:bg-slate-50"
              >
                Submit another request
              </button>
            </div>
          ) : (
            <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              {/* Tabs */}
              <div className="mb-6 grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
                <button
                  onClick={() => { setTab("new_connection"); setErr(""); }}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition sm:text-sm ${
                    tab === "new_connection" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"
                  }`}
                >
                  <Droplet size={16} /> New Connection
                </button>
                <button
                  onClick={() => { setTab("reconnection"); setErr(""); }}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition sm:text-sm ${
                    tab === "reconnection" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"
                  }`}
                >
                  <PlugZap size={16} /> Reconnection
                </button>
                <button
                  onClick={() => { setTab("concern"); setErr(""); }}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition sm:text-sm ${
                    tab === "concern" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"
                  }`}
                >
                  <MessageSquare size={16} /> Concern / Feedback
                </button>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Full Name" required>
                    <input className={inputCls} value={form.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="Juan Dela Cruz" />
                  </Field>
                  <Field label="Contact Number" required>
                    <input className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="09xx xxx xxxx" />
                  </Field>
                </div>

                {tab === "new_connection" ? (
                  <>
                    <Field label="Email (optional)">
                      <input className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@email.com" />
                    </Field>
                    <Field label="Full Address" required>
                      <textarea rows={2} className={inputCls} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="House/Lot, Street/Sitio/Purok, Barangay, Municipality, Province" />
                    </Field>
                    <Field label="Type of Installation">
                      <select className={inputCls} value={form.installationType} onChange={(e) => set("installationType", e.target.value)}>
                        <option value="residential">Residential</option>
                        <option value="commercial">Commercial</option>
                        <option value="institutional">Institutional</option>
                        <option value="government">Government</option>
                      </select>
                    </Field>
                  </>
                ) : tab === "reconnection" ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Account Number" required>
                      <input className={inputCls} value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} placeholder="e.g. PN123" />
                    </Field>
                    <Field label="Meter Number" required>
                      <input className={inputCls} value={form.meterNumber} onChange={(e) => set("meterNumber", e.target.value)} placeholder="e.g. MTR456" />
                    </Field>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Type of Concern" required>
                      <select className={inputCls} value={form.concernType} onChange={(e) => set("concernType", e.target.value)}>
                        {CONCERN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </Field>
                    <Field label="Account Number (optional)">
                      <input className={inputCls} value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} placeholder="if you have one" />
                    </Field>
                  </div>
                )}

                <Field label={tab === "concern" ? "Your concern / feedback" : "Message / Notes (optional)"} required={tab === "concern"}>
                  <textarea rows={3} className={inputCls} value={form.message} onChange={(e) => set("message", e.target.value)} placeholder={tab === "concern" ? "Describe your concern or feedback…" : "Anything else we should know?"} />
                </Field>

                {err && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>}

                <button disabled={busy} className="w-full rounded-2xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {busy ? "Submitting…" : "Submit Request"}
                </button>
                <p className="text-center text-xs text-slate-400">To prevent spam, identical requests can't be submitted twice while still open.</p>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
