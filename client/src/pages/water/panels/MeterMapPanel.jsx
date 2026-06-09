// Meter Map — Leaflet view of every meter the field readers have
// pinned. Each marker is colored by status (read this period vs
// unread vs unpaid/overdue), shows a senior badge when applicable,
// and flips to a warning icon when the meter is flagged for
// disconnection. Click a marker to see owner / meter info.
//
// The data comes from GET /api/water/members/map and is refreshed
// when the period selector changes. Field plumbers fill in the
// coordinates automatically as they sync readings — see
// /water/batches/import-readings.

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, LayersControl, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import Card from "../../../components/Card";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";

// Fix Leaflet's default marker icon paths — Vite bundles assets via
// imports, but Leaflet's stock CSS expects them under /images/.
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

function statusFor(pin) {
  if (pin.isSubjectForDisconnection) return "disconnect";
  if (pin.billStatus === "overdue" || (pin.billStatus !== "paid" && pin.totalDue > 0 && !pin.hasReading)) return "overdue";
  if (pin.billStatus === "unpaid" && pin.totalDue > 0) return "unpaid";
  if (pin.hasReading) return "read";
  return "unread";
}

const COLOR = {
  read: "#10b981", // emerald — already read this period
  unread: "#ffffff", // white — pinned but not yet read
  unpaid: "#f97316", // orange — read & billed but not paid
  overdue: "#dc2626", // red — past due
  disconnect: "#7c3aed", // purple — pending disconnection alert
};

// Build a circle marker SVG icon. Tiny inline SVG so we don't ship a
// dozen PNG variants — color + senior badge are composed at runtime.
function buildIcon(pin) {
  const status = statusFor(pin);
  const fill = COLOR[status];
  const stroke = status === "unread" ? "#475569" : "#0f172a";
  const senior = pin.isSenior ? '<circle cx="20" cy="6" r="5" fill="#f59e0b" stroke="#fff" stroke-width="1.5"/>' : "";
  const alert = status === "disconnect"
    ? '<text x="12" y="17" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="bold" fill="#fff">!</text>'
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <circle cx="12" cy="12" r="10" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
    ${alert}
    ${senior}
  </svg>`;
  return L.divIcon({
    className: "",
    html: svg,
    iconSize: [28, 28],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}

// Heatmap overlay using leaflet.heat — fed by consumption m³ per pin
// so a hot zone visually corresponds to high water usage.
function HeatLayer({ pins, enabled }) {
  const map = useMap();
  const layerRef = useRef(null);
  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (!enabled || pins.length === 0) return;
    const points = pins
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => [p.lat, p.lng, Math.max(0.2, Math.min(1, (Number(p.consumed) || 0) / 30))]);
    layerRef.current = L.heatLayer(points, { radius: 25, blur: 18, maxZoom: 17 }).addTo(map);
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [enabled, pins, map]);
  return null;
}

// Centre + fit the map on the first batch of pins so the user lands
// looking at their actual barangay, not the global default.
function FitToPins({ pins }) {
  const map = useMap();
  useEffect(() => {
    if (pins.length === 0) return;
    const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng]));
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.15));
  }, [pins, map]);
  return null;
}

export default function MeterMapPanel() {
  const { token } = useAuth();
  const [pins, setPins] = useState([]);
  const [periodKey, setPeriodKey] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [heatOn, setHeatOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    apiFetch(`/water/members/map?periodKey=${periodKey}`, { token })
      .then((res) => {
        if (cancelled) return;
        setPins(res.pins || []);
      })
      .catch((e) => !cancelled && setErr(e.message || "Failed to load map"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [periodKey, token]);

  const counts = useMemo(() => {
    const c = { read: 0, unread: 0, unpaid: 0, overdue: 0, disconnect: 0, senior: 0, total: pins.length };
    for (const p of pins) {
      c[statusFor(p)]++;
      if (p.isSenior) c.senior++;
    }
    return c;
  }, [pins]);

  // Default map view: Asturias, Cebu (best fit until pins load).
  const defaultCenter = [10.5639, 123.7136];
  const defaultZoom = 14;

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100">
        <div>
          <div className="text-lg font-bold text-slate-900">Meter Map</div>
          <div className="text-xs text-slate-500">
            Pins update automatically when plumbers sync readings with location enabled.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={heatOn}
              onChange={(e) => setHeatOn(e.target.checked)}
            />
            Consumption heatmap
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-4 py-3 text-[11px] border-b border-slate-100 bg-slate-50">
        <Legend color={COLOR.read} label={`Read this period (${counts.read})`} />
        <Legend color={COLOR.unread} label={`Pinned, not yet read (${counts.unread})`} bordered />
        <Legend color={COLOR.unpaid} label={`Unpaid (${counts.unpaid})`} />
        <Legend color={COLOR.overdue} label={`Overdue (${counts.overdue})`} />
        <Legend color={COLOR.disconnect} label={`Disconnection (${counts.disconnect})`} />
        <Legend color="#f59e0b" label={`Senior badge (${counts.senior})`} dot />
        <div className="ml-auto text-slate-600 font-semibold">{counts.total} meter{counts.total === 1 ? "" : "s"} pinned</div>
      </div>

      {err && (
        <div className="m-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      )}

      <div className="h-[70vh]">
        <MapContainer center={defaultCenter} zoom={defaultZoom} className="h-full w-full" scrollWheelZoom>
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Streets (OSM)">
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Satellite (Esri)">
              <TileLayer
                attribution="Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, USDA, USGS, AeroGRID, IGN, and the GIS User Community"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Light (Carto)">
              <TileLayer
                attribution='&copy; OpenStreetMap, &copy; CARTO'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              />
            </LayersControl.BaseLayer>
          </LayersControl>
          <FitToPins pins={pins} />
          <HeatLayer pins={pins} enabled={heatOn} />
          {pins.map((p) => (
            <Marker key={`${p.pnNo}__${p.meterNumber}`} position={[p.lat, p.lng]} icon={buildIcon(p)}>
              <Popup>
                <div className="text-[13px] leading-snug">
                  <div className="font-bold text-slate-900">{p.accountName}</div>
                  {p.subName && <div className="text-amber-700">({p.subName})</div>}
                  <div className="mt-1 text-slate-600">
                    PN <span className="font-mono">{p.pnNo}</span>
                    <br/>
                    Meter <span className="font-mono">{p.meterNumber}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1 text-[11px]">
                    {p.classification && <Tag color="slate">{p.classification}</Tag>}
                    {p.sitio && <Tag color="blue">{p.sitio}</Tag>}
                    {p.isSenior && <Tag color="amber">Senior</Tag>}
                    {p.isSubjectForDisconnection && <Tag color="purple">Disconnection</Tag>}
                  </div>
                  {p.hasReading || p.totalDue > 0 ? (
                    <div className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 font-mono text-[11px]">
                      {p.hasReading && <div>Consumed: <b>{p.consumed} m³</b></div>}
                      {p.totalDue > 0 && <div>Total due: <b>₱{Number(p.totalDue).toFixed(2)}</b> ({p.billStatus})</div>}
                    </div>
                  ) : (
                    <div className="mt-2 text-slate-500 text-[11px] italic">No reading yet for {periodKey}</div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/40 pointer-events-none">
          <div className="rounded-xl bg-white border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow">
            Loading…
          </div>
        </div>
      )}
    </Card>
  );
}

function Legend({ color, label, bordered, dot }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block ${dot ? "h-2 w-2" : "h-3 w-3"} rounded-full`}
        style={{ background: color, border: bordered ? "1px solid #475569" : undefined }}
      />
      {label}
    </span>
  );
}

function Tag({ children, color }) {
  const map = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
    purple: "bg-purple-100 text-purple-700",
  };
  return <span className={`rounded px-1.5 py-0.5 font-semibold ${map[color] || map.slate}`}>{children}</span>;
}
