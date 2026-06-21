import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../lib/api";
import Navbar from "../../components/Navbar";
import PublicAppInstallBanner from "../../components/PublicAppInstallBanner";
import logo from "../../assets/logo.png";
import building from "../../assets/powasscobuilding.jpg";
import developerPhoto from "../../assets/developer.jpg";
import {
  Droplets,
  FileSearch,
  Calculator,
  HandCoins,
  ArrowRight,
  ShieldCheck,
  Clock,
  Users,
  Code2,
  Send,
  CheckCircle2,
} from "lucide-react";

// Public "message the developer" form. Submissions land in the admin
// dashboard's Dev Feedback inbox (POST /public/dev-feedback — rate
// limited to 5 per 10 minutes per IP against spam).
function DeveloperFeedbackForm() {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (message.trim().length < 5) { setErr("Please write a short message first."); return; }
    setBusy(true);
    try {
      await apiFetch("/public/dev-feedback", {
        method: "POST",
        body: { name: name.trim(), contact: contact.trim(), message: message.trim(), page: window.location.pathname },
      });
      setSent(true);
    } catch (e2) {
      setErr(e2.message || "Failed to send — try again later.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-emerald-300 bg-emerald-50 p-8 text-center">
        <CheckCircle2 size={36} className="text-emerald-600" />
        <div className="mt-3 font-bold text-emerald-900">Message sent — thank you!</div>
        <div className="mt-1 text-sm text-emerald-700">Your feedback goes straight to the developer's inbox.</div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          maxLength={80}
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="Email / phone (optional)"
          maxLength={120}
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="Bug report, suggestion, or any feedback about the system…"
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        required
      />
      {err && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
      <button
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        <Send size={14} /> {busy ? "Sending…" : "Send to Developer"}
      </button>
    </form>
  );
}

const services = [
  { icon: FileSearch, title: "Bill Inquiry", desc: "Check your water bill, consumption history, and payment status online.", to: "/inquiry", cta: "Check your bill" },
  { icon: Calculator, title: "Tariff Calculator", desc: "Estimate your monthly water bill by consumption and classification.", to: "/calculator", cta: "Calculate" },
  { icon: HandCoins, title: "Member Loans", desc: "Affordable member loans with flexible terms and clear amortization.", to: "/about", cta: "Learn more" },
  { icon: Droplets, title: "Water Billing", desc: "Accurate metered billing managed by the cooperative.", to: "/about", cta: "Learn more" },
];

const stats = [
  { value: "25+", label: "Years of service" },
  { value: "2,000+", label: "Members served" },
];

const trust = [
  { icon: ShieldCheck, t: "Transparent billing", d: "Tiered tariffs and clear, itemized computations." },
  { icon: Clock, t: "Anytime access", d: "Inquire and estimate online, 24/7." },
  { icon: Users, t: "Member-owned", d: "A cooperative serving its own community." },
];

function HomeAnnouncements() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    apiFetch("/public/announcements").then(setItems).catch(() => {});
  }, []);
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-5 pt-16">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Announcements</h2>
        <p className="mt-2 text-slate-500">Latest news and notices from the cooperative.</p>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.slice(0, 6).map((a) => (
          <div key={a._id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {a.image && <img src={a.image} alt="" className="h-40 w-full object-cover" />}
            <div className="p-4">
              <div className="font-bold text-slate-900">{a.title}</div>
              {a.body && <p className="mt-1 text-sm text-slate-600">{a.body}</p>}
              <div className="mt-2 text-xs text-slate-400">{new Date(a.createdAt).toLocaleDateString()}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Poppins', ui-sans-serif, system-ui, sans-serif" }}>
      <Navbar />

      {/* Install-app banner — sits above the hero so visitors see the CTA
          before scrolling. Android sees an inline 'Install now' button;
          iPhone users see the Safari 'Add to Home Screen' steps; desktop
          sees Chrome/Edge install instructions. */}
      <section className="relative mx-auto max-w-6xl px-4 pt-24 sm:pt-28">
        <PublicAppInstallBanner />
      </section>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          {/* POWASSCO office building — our home in Owak, Asturias, Cebu. */}
          <img src={building} alt="POWASSCO Multipurpose Cooperative office building" className="h-full w-full object-cover object-center" />
          {/* Professional fade: dark behind the headline (left), clearing over
              the building (right) so the photo stays visible. */}
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/95 via-emerald-900/75 to-emerald-900/30" />
          {/* Depth fade top→bottom so the overlapping stats blend cleanly. */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-emerald-950/35" />
        </div>
        <div className="relative mx-auto max-w-6xl px-5 pb-28 pt-32 sm:pt-40">
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-emerald-50 ring-1 ring-white/20 backdrop-blur">
              <img src={logo} alt="" className="h-5 w-5 rounded object-contain" />
              POWASSCO Multipurpose Cooperative
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
              Clean water and trusted cooperative services, <span className="text-emerald-300">for every home.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-emerald-50/90">
              Check your water bill, estimate tariffs, and access member loans — transparent,
              modern, and always within reach for the community of Owak, Asturias, Cebu.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/inquiry" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-emerald-800 shadow-lg transition hover:bg-emerald-50">
                Check your bill <ArrowRight size={16} />
              </Link>
              <Link to="/calculator" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/30 backdrop-blur transition hover:bg-white/20">
                <Calculator size={16} /> Tariff calculator
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats (overlapping the hero) */}
      <section className="relative mx-auto -mt-12 max-w-6xl px-5">
        <div className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:grid-cols-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl px-4 py-3 text-center">
              <div className="text-2xl font-bold text-emerald-700">{s.value}</div>
              <div className="text-sm text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <HomeAnnouncements />

      {/* Services */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Our services</h2>
          <p className="mt-2 text-slate-500">Everything members need, in one clean, modern portal.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((sv) => {
            const Icon = sv.icon;
            return (
              <Link key={sv.title} to={sv.to} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Icon size={24} strokeWidth={2.2} />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{sv.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{sv.desc}</p>
                <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">
                  {sv.cta} <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Trust band */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-5 py-12 sm:grid-cols-3">
          {trust.map((x) => {
            const Icon = x.icon;
            return (
              <div key={x.t} className="flex items-start gap-3">
                <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700">
                  <Icon size={20} />
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{x.t}</div>
                  <div className="text-sm text-slate-500">{x.d}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="rounded-3xl bg-gradient-to-br from-emerald-700 to-cyan-700 px-8 py-12 text-center shadow-xl">
          <h2 className="text-2xl font-bold text-white">Ready to check your account?</h2>
          <p className="mx-auto mt-2 max-w-lg text-emerald-50/90">
            Enter your PN number to view bills, payments, meters, and loans.
          </p>
          <Link to="/inquiry" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-emerald-800 shadow-lg transition hover:bg-emerald-50">
            Go to Bill Inquiry <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Developer spotlight + feedback inbox */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white shadow-xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
              <Code2 size={14} /> System Developer
            </div>
            <div className="mt-4 flex items-center gap-4">
              <img
                src={developerPhoto}
                alt="Gerald Durano"
                className="h-20 w-20 rounded-2xl border-2 border-emerald-400/60 object-cover shadow-lg"
              />
              <div>
                <h3 className="text-2xl font-extrabold tracking-tight">Gerald Durano</h3>
                <a
                  href="https://www.facebook.com/gerald.durano.16"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-300 hover:text-emerald-200"
                >
                  {/* Facebook glyph (inline SVG — lucide has no brand icons) */}
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047v-2.66c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97H15.83c-1.491 0-1.956.93-1.956 1.886v2.265h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
                  </svg>
                  Contact Developer on Facebook
                </a>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                "Full Stack Developer",
                "MERN Software Engineer",
                "AI Engineer",
                "Data Analyst",
                "Project Manager",
                "Security Consultant",
              ].map((t) => (
                <span key={t} className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
                  {t}
                </span>
              ))}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              Designed and built the POWASSCO management system end to end — water billing, loans,
              savings, payroll, online payments, and the member-facing PWA you're using right now.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Message the Developer</h3>
            <p className="mt-1 mb-4 text-sm text-slate-500">
              Found a bug? Have a suggestion? Send it straight to the developer's inbox.
            </p>
            <DeveloperFeedbackForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            <div>
              <div className="flex items-center gap-3">
                <img src={logo} alt="POWASSCO" className="h-10 w-10 rounded-lg object-contain" />
                <div>
                  <div className="font-bold text-slate-900">POWASSCO</div>
                  <div className="text-xs text-slate-500">Multipurpose Cooperative</div>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                Sustainable water management and cooperative services for the community.
              </p>
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Quick links</div>
              <ul className="mt-3 space-y-2 text-sm text-slate-500">
                <li><Link to="/" className="hover:text-emerald-700">Home</Link></li>
                <li><Link to="/inquiry" className="hover:text-emerald-700">Bill Inquiry</Link></li>
                <li><Link to="/calculator" className="hover:text-emerald-700">Tariff Calculator</Link></li>
                <li><Link to="/about" className="hover:text-emerald-700">About</Link></li>
              </ul>
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Contact</div>
              <ul className="mt-3 space-y-2 text-sm text-slate-500">
                <li>Owak, Asturias, Cebu</li>
                <li>info@powassco.com</li>
                <li>Mon–Fri: 8:00 AM – 5:00 PM</li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-slate-100 pt-6 text-center text-xs text-slate-400">
            © 2026 POWASSCO Multipurpose Cooperative. All rights reserved. · Developed by Gerald Durano
          </div>
        </div>
      </footer>
    </div>
  );
}
