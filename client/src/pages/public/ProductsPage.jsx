import { useEffect, useMemo, useState } from "react";
import Navbar from "../../components/Navbar";
import { apiFetch } from "../../lib/api";
import { Store, MapPin, Search, PackageOpen, Loader2, Tag, Boxes } from "lucide-react";

const peso = (n) => "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Catalog enum → friendly store labels (per request).
const CATEGORY_LABELS = {
  materials: "Water Materials",
  frozen_goods: "Frozen Goods",
  rice: "Rice & Varieties",
  appliance: "Appliances",
  construction: "Construction",
  rental: "Rentals",
  other: "Product Items",
};
const catLabel = (c) => CATEGORY_LABELS[c] || "Product Items";

export default function ProductsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    apiFetch("/public/products")
      .then((r) => setItems(r.items || []))
      .catch((e) => setErr(e.message || "Failed to load products."))
      .finally(() => setLoading(false));
  }, []);

  // Categories present in the catalog, ordered, for the filter pills.
  const cats = useMemo(() => {
    const order = ["materials", "frozen_goods", "rice", "appliance", "construction", "rental", "other"];
    const present = new Set(items.map((i) => i.category || "other"));
    return order.filter((c) => present.has(c));
  }, [items]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((i) => {
      if (cat !== "all" && (i.category || "other") !== cat) return false;
      if (term && !`${i.name} ${catLabel(i.category)}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [items, cat, q]);

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100 px-4 pb-16 pt-24">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="text-center">
            <h1 className="inline-flex items-center gap-2 text-2xl font-extrabold text-slate-900 sm:text-3xl">
              <Store className="text-emerald-600" size={28} /> POWASSCO Store
            </h1>
            <p className="mt-2 text-sm text-slate-500">Browse what's available at the cooperative. Prices and stocks are updated by the office.</p>
          </div>

          {/* Visit-us + loan-terms banner */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 shadow-sm">
              <MapPin className="mt-0.5 shrink-0 text-emerald-600" size={20} />
              <div className="text-sm">
                <div className="font-bold text-slate-900">Available in POWASSCO Multipurpose Cooperative building</div>
                <div className="text-slate-500">Visit us to view items in person and place your order.</div>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
              <Tag className="mt-0.5 shrink-0 text-amber-600" size={20} />
              <div className="text-sm">
                <div className="font-bold text-amber-900">Open to all Members — loanable items</div>
                <div className="text-amber-800/80"><b>Rice</b>: 1 month payable term • <b>Frozen goods</b>: 15 days payable term.</div>
              </div>
            </div>
          </div>

          {/* Search + category filter */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search products…"
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Pill active={cat === "all"} onClick={() => setCat("all")}>All</Pill>
              {cats.map((c) => (
                <Pill key={c} active={cat === c} onClick={() => setCat(c)}>{catLabel(c)}</Pill>
              ))}
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="py-20 text-center text-slate-500"><Loader2 className="mx-auto animate-spin" /> Loading products…</div>
          ) : err ? (
            <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">{err}</div>
          ) : shown.length === 0 ? (
            <div className="mt-10 rounded-3xl border border-dashed border-slate-300 p-12 text-center text-slate-500">
              <PackageOpen className="mx-auto mb-2 text-slate-300" size={40} />
              No products to show{cat !== "all" ? " in this category" : ""}.
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {shown.map((p) => <ProductCard key={p._id} p={p} />)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Pill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${active ? "bg-emerald-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
    >
      {children}
    </button>
  );
}

function ProductCard({ p }) {
  const out = (Number(p.stock) || 0) <= 0;
  return (
    <div className={`group overflow-hidden rounded-2xl border bg-white shadow-sm transition ${out ? "border-slate-200 opacity-70" : "border-slate-200 hover:shadow-md"}`}>
      {/* Image */}
      <div className="relative aspect-square w-full bg-slate-50">
        {p.imageBase64 ? (
          <img src={p.imageBase64} alt={p.name} className={`h-full w-full object-cover ${out ? "grayscale" : ""}`} loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300"><Boxes size={40} /></div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-600 shadow-sm">{catLabel(p.category)}</span>
        {out && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/40">
            <span className="rounded-full bg-slate-700 px-3 py-1 text-xs font-bold text-white">Not available</span>
          </div>
        )}
      </div>
      {/* Body */}
      <div className="p-3">
        <div className="line-clamp-2 min-h-[2.5rem] text-sm font-bold text-slate-900">{p.name}</div>
        {p.description && <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">{p.description}</div>}
        <div className="mt-2 flex items-center justify-between">
          <div className="text-base font-extrabold text-emerald-700">{peso(p.unitPrice)}</div>
          {out ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">0 in stock</span>
          ) : (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{p.stock} in stock</span>
          )}
        </div>
      </div>
    </div>
  );
}
