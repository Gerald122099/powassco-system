import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../lib/api";
import Navbar from "../../components/Navbar";
import PublicAppInstallBanner from "../../components/PublicAppInstallBanner";
import logo from "../../assets/logo.png";
import bg from "../../assets/bg.jpg";
import {
  Droplets,
  FileSearch,
  Calculator,
  HandCoins,
  ArrowRight,
  ShieldCheck,
  Clock,
  Users,
} from "lucide-react";

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
          <img src={bg} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/90 via-emerald-800/80 to-cyan-900/85" />
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
