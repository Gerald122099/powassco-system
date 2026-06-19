// Purok management (meter-reader office). Define the purok names per area,
// optionally bundle them into reading GROUPS (e.g. "Looc Sur 1" = Puroks
// 1-3), assign members to a purok, and check which meters are still
// unassigned. This is what divides the open-pool field reading.
import { useEffect, useState, useCallback } from "react";
import Card from "../../../components/Card";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";
import { toast } from "../../../components/Toast";
import { MapPin, Plus, Pencil, Trash2, Check, X, Search, FolderTree, AlertTriangle, RefreshCw } from "lucide-react";

export default function PurokManagementPanel() {
  const { token } = useAuth();
  const [areas, setAreas] = useState([]);
  const [area, setArea] = useState("");
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [editing, setEditing] = useState(null); // purok _id being edited
  const [editName, setEditName] = useState("");
  const [editGroup, setEditGroup] = useState("");

  const [members, setMembers] = useState([]);
  const [filter, setFilter] = useState("all"); // "all" | "unassigned" | purok name
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [assignTo, setAssignTo] = useState("");
  const [busy, setBusy] = useState(false);

  const loadAreas = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/water/puroks", { token });
      const list = r.areas || [];
      setAreas(list);
      setArea((a) => a || list[0]?.barangay || "");
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { loadAreas(); }, [loadAreas]);

  const current = areas.find((a) => a.barangay === area) || null;

  const loadMembers = useCallback(async () => {
    if (!area) { setMembers([]); return; }
    const p = new URLSearchParams({ barangay: area });
    if (filter === "unassigned") p.set("unassigned", "1");
    else if (filter !== "all") p.set("purok", filter);
    if (search.trim()) p.set("search", search.trim());
    try { setMembers(await apiFetch(`/water/puroks/members?${p}`, { token })); }
    catch (e) { toast.error(e.message); }
  }, [area, filter, search, token]);
  useEffect(() => { const t = setTimeout(loadMembers, search ? 300 : 0); return () => clearTimeout(t); }, [loadMembers, search]);
  useEffect(() => { setSelected(new Set()); }, [area, filter]);

  async function addPurok() {
    if (!newName.trim() || !area) return;
    try {
      await apiFetch("/water/puroks", { method: "POST", token, body: { barangay: area, name: newName.trim(), group: newGroup.trim() } });
      setNewName(""); setNewGroup("");
      toast.success("Purok added"); loadAreas();
    } catch (e) { toast.error(e.message); }
  }
  async function saveEdit(id) {
    try {
      await apiFetch(`/water/puroks/${id}`, { method: "PATCH", token, body: { name: editName.trim(), group: editGroup.trim() } });
      setEditing(null); toast.success("Saved"); loadAreas(); loadMembers();
    } catch (e) { toast.error(e.message); }
  }
  async function delPurok(p) {
    if (!window.confirm(`Delete "${p.name}"? Its ${p.members} member(s) become unassigned.`)) return;
    try { await apiFetch(`/water/puroks/${p._id}`, { method: "DELETE", token }); toast.success("Deleted"); loadAreas(); loadMembers(); }
    catch (e) { toast.error(e.message); }
  }
  async function renameArea() {
    if (!area) return;
    const to = window.prompt(`Rename / merge area "${area}" into:\n(e.g. fold "Owak" into "Owak Proper" — all its members + puroks move over)`, area);
    if (!to || !to.trim() || to.trim() === area) return;
    try {
      const r = await apiFetch("/water/puroks/rename-area", { method: "POST", token, body: { from: area, to: to.trim() } });
      toast.success(`Moved ${r.members} member(s) → ${to.trim()}`);
      setArea(to.trim()); loadAreas();
    } catch (e) { toast.error(e.message); }
  }
  async function assignSelected() {
    if (!selected.size) return;
    setBusy(true);
    try {
      const r = await apiFetch("/water/puroks/assign", { method: "POST", token, body: { pnNos: [...selected], purok: assignTo } });
      toast.success(`${r.updated} member(s) → ${assignTo || "Unassigned"}`);
      setSelected(new Set()); loadAreas(); loadMembers();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  const toggle = (pn) => setSelected((s) => { const n = new Set(s); n.has(pn) ? n.delete(pn) : n.add(pn); return n; });
  const allSel = members.length > 0 && members.every((m) => selected.has(m.pnNo));

  // Group the area's puroks by their `group` for display.
  const groupsMap = new Map();
  for (const p of (current?.puroks || [])) {
    const g = p.group || "—";
    if (!groupsMap.has(g)) groupsMap.set(g, []);
    groupsMap.get(g).push(p);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <MapPin size={20} className="text-purple-600" /> Puroks &amp; Field Grouping
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Define purok names per area, bundle them into reading groups, assign members, and find unassigned meters.
            Field readers download all meters divided by these puroks.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={area} onChange={(e) => setArea(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            {areas.length === 0 && <option value="">No areas yet</option>}
            {areas.map((a) => <option key={a.barangay} value={a.barangay}>{a.barangay} ({a.total})</option>)}
          </select>
          <button onClick={renameArea} disabled={!area} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50" title="Rename or merge this area">Rename area</button>
          <button onClick={loadAreas} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button>
        </div>
      </div>

      {current && current.unassigned > 0 && (
        <button onClick={() => setFilter("unassigned")} className="mt-3 flex w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-semibold text-amber-800 hover:bg-amber-100">
          <AlertTriangle size={14} /> {current.unassigned} meter(s) in {area} have no purok yet — tap to assign them.
        </button>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        {/* ── Puroks of the area ── */}
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><FolderTree size={13} /> Puroks in {area || "—"}</div>
          <div className="space-y-3">
            {[...groupsMap.entries()].map(([g, list]) => (
              <div key={g} className="rounded-xl border border-slate-200">
                <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-600">{g === "—" ? "Ungrouped" : `Group: ${g}`}</div>
                {list.map((p) => (
                  <div key={p._id} className="flex items-center gap-2 border-t border-slate-50 px-3 py-1.5 text-sm first:border-t-0">
                    {editing === p._id ? (
                      <>
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-xs" placeholder="name" />
                        <input value={editGroup} onChange={(e) => setEditGroup(e.target.value)} className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-xs" placeholder="group" />
                        <button onClick={() => saveEdit(p._id)} className="rounded-lg bg-emerald-600 p-1 text-white"><Check size={12} /></button>
                        <button onClick={() => setEditing(null)} className="rounded-lg border border-slate-200 p-1 text-slate-500"><X size={12} /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setFilter(p.name)} className={`flex-1 text-left font-semibold ${filter === p.name ? "text-purple-700" : "text-slate-800"}`}>{p.name}</button>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{p.members}</span>
                        <button onClick={() => { setEditing(p._id); setEditName(p.name); setEditGroup(p.group || ""); }} className="text-slate-400 hover:text-purple-600"><Pencil size={13} /></button>
                        <button onClick={() => delPurok(p)} className="text-slate-400 hover:text-red-600"><Trash2 size={13} /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {current && current.puroks.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">No puroks yet — add the first one below.</div>}
          </div>
          {/* add purok */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Purok name (e.g. Purok 1)" className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="Group (optional)" className="w-32 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <button onClick={addPurok} disabled={!newName.trim() || !area} className="inline-flex items-center gap-1 rounded-xl bg-purple-600 px-3 py-2 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-50"><Plus size={14} /> Add</button>
          </div>
        </div>

        {/* ── Member assignment ── */}
        <div className="lg:col-span-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 text-xs">
              <button onClick={() => setFilter("all")} className={`px-3 py-1.5 font-semibold ${filter === "all" ? "bg-purple-600 text-white" : "text-slate-600"}`}>All</button>
              <button onClick={() => setFilter("unassigned")} className={`px-3 py-1.5 font-semibold ${filter === "unassigned" ? "bg-amber-500 text-white" : "text-amber-700"}`}>Unassigned{current ? ` (${current.unassigned})` : ""}</button>
            </div>
            <div className="relative flex-1 min-w-[10rem]">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name / account no." className="w-full rounded-xl border border-slate-200 py-2 pl-8 pr-3 text-sm" />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-500">
              <input type="checkbox" checked={allSel} onChange={(e) => setSelected(e.target.checked ? new Set(members.map((m) => m.pnNo)) : new Set())} />
              <span className="flex-1">{members.length} member(s){filter !== "all" ? ` • ${filter === "unassigned" ? "unassigned" : filter}` : ""}</span>
              <span>{selected.size} selected</span>
            </div>
            <div className="max-h-[46vh] overflow-auto">
              {members.map((m) => (
                <label key={m.pnNo} className="flex cursor-pointer items-center gap-2 border-t border-slate-50 px-3 py-1.5 text-sm hover:bg-purple-50/40">
                  <input type="checkbox" checked={selected.has(m.pnNo)} onChange={() => toggle(m.pnNo)} />
                  <span className="flex-1 truncate font-medium text-slate-800">{m.accountName}</span>
                  <span className="font-mono text-[10px] text-slate-400">{m.pnNo}</span>
                  {m.purok
                    ? <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">{m.purok}</span>
                    : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">unassigned</span>}
                </label>
              ))}
              {members.length === 0 && <div className="px-3 py-6 text-center text-xs text-slate-400">No members.</div>}
            </div>
          </div>

          {/* assign bar */}
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-xs font-semibold text-slate-600">Assign {selected.size} selected to:</span>
            <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
              <option value="">— Unassign —</option>
              {(current?.puroks || []).map((p) => <option key={p._id} value={p.name}>{p.name}{p.group ? ` (${p.group})` : ""}</option>)}
            </select>
            <button onClick={assignSelected} disabled={!selected.size || busy} className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-50">
              {busy ? "Assigning…" : "Assign"}
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
