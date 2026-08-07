// Report export helpers — a polished PDF (jsPDF + autotable) and a real,
// styled Excel workbook (.xlsx via ExcelJS). Used by the cashier +
// bookkeeper Reports panels (Treasurer's Report, Petty Cash, …).
//
// Letterhead format:
//   [logo]  POWASSCO MULTIPURPOSE COOPERATIVE
//           Owak, Asturias, Cebu • C.D.A Reg. No. 9520-07014753
//           [Report Title]
//           For the period: <from> – <to>
//
// PDF: branded header + logo, zebra rows, repeating column headers across
// pages, a bordered totals box, signature blocks, and a "Page X of Y"
// footer on every page.
// Excel: merged title block, frozen green header, auto-fit columns, and
// numeric cells kept as REAL numbers (₱ format) so they sum/pivot natively.

import { saveAs } from "file-saver";
import logoUrl from "../assets/logo.png";
// Subset Noto Sans (SIL OFL) with Latin + currency incl. ₱ (U+20B1). jsPDF's
// built-in fonts are Latin-1 only and can't draw ₱; embedding this lets the
// PDF print the real peso sign. ~20 KB, fetched + cached on first export.
import reportFontUrl from "../assets/fonts/NotoSans-Report.ttf";

// jsPDF + autotable + exceljs are heavy (~1 MB combined) and only needed
// when the user actually exports, so they're lazy-loaded on demand —
// keeping the dashboard bundles that import this module lean.
//
// That lazy dynamic import() fetches a specific hashed chunk URL (e.g.
// jspdf.es.min-D8uLD4IL.js). If the tab has been open since BEFORE a new
// deploy, that exact hash may no longer exist on the server (replaced by the
// new build's chunk) — the browser throws a raw, cryptic "Failed to fetch
// dynamically imported module" error. This isn't a bug in the export itself;
// translate it into an actionable message instead of leaking the internal
// error.
function isStaleChunkError(e) {
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(e?.message || "");
}
async function loadExportDeps(loaders) {
  try {
    return await Promise.all(loaders.map((l) => l()));
  } catch (e) {
    if (isStaleChunkError(e)) {
      throw new Error("This app was just updated. Please refresh the page (F5) and try exporting again.");
    }
    throw e;
  }
}

const GREEN = [22, 101, 52];      // #166534
const SLATE = [71, 85, 105];      // slate-600
const INK = [15, 23, 42];         // slate-900
const ZEBRA = [248, 250, 252];    // slate-50
const GROUP_TOTAL_BG = [219, 234, 254]; // blue-100 — the bold "main" row of a grouped OR
const GROUP_TOTAL_INK = [30, 64, 175];  // blue-800
const SUBROW_BG = [248, 250, 252];      // slate-50 — that OR's individual meter/period lines

const peso = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" }) : "—");
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—");

// FALLBACK only: if the embedded Unicode font fails to load, the built-in
// Latin-1 font can't draw ₱ (renders as a box), so swap it for "PHP ". When
// the font loads (normal case) the real ₱ is used.
const pdfSafe = (s) => String(s ?? "").replace(/₱/g, "PHP ");

// The embedded report font (NotoSans-Report.ttf) is a small ~20KB SUBSET —
// Latin + peso only, no arrows/dingbats/symbols. A character outside that
// subset doesn't just render as a blank box: it can corrupt the position of
// EVERY character after it in the same jsPDF text run (a custom-TTF glyph-
// lookup quirk), which is what produced garbled, letter-spaced, truncated
// cells the one time an arrow ("↳") slipped into a generated label. Strip
// just the arrow/misc-symbol Unicode blocks defensively — accented Latin
// (member names like "Peña") is untouched, only genuinely exotic glyphs are
// removed — so this class of bug can't silently recur from a future label.
const stripUnsafePdfGlyphs = (s) => String(s ?? "").replace(/[←-⇿⌀-➿]/g, "");

// Load the report font once, as base64, for jsPDF embedding. Cached across
// exports; resolves to null if it can't be fetched (→ Helvetica fallback).
let _fontB64Promise = null;
function getReportFontB64() {
  if (!_fontB64Promise) {
    _fontB64Promise = fetch(reportFontUrl)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        let bin = "";
        const CH = 0x8000;
        for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        return btoa(bin);
      })
      .catch(() => null);
  }
  return _fontB64Promise;
}

const ORG = "POWASSCO MULTIPURPOSE COOPERATIVE";
const ADDR = "Owak, Asturias, Cebu • C.D.A Reg. No. 9520-07014753";

// A right-aligned column is treated as numeric for Excel (real number + ₱).
const isNumericCol = (c) => c.align === "right";
const cellValue = (c, r) => {
  const raw = r[c.key];
  return c.format ? c.format(raw, r) : (raw ?? "—");
};

// ─── logo (loaded once, as a dataURL for jsPDF) ───────────────────────
let _logoPromise = null;
function getLogoDataUrl() {
  if (!_logoPromise) {
    _logoPromise = fetch(logoUrl)
      .then((res) => res.blob())
      .then((blob) => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      }))
      .catch(() => null);
  }
  return _logoPromise;
}

// ─── PDF ──────────────────────────────────────────────────────────────

export async function exportPdf({
  title,
  subtitle,     // optional small line under the title
  fromDate,
  toDate,
  periodLabel: periodLabelOverride, // e.g. "OR # 40760 to 41200" — replaces the date-range line entirely
  preparedBy,
  columns,      // [{ header, key, align?, format?(v, row) }]
  rows,         // raw row objects
  totals,       // [{ label, value }]
  filename,
}) {
  const [{ default: jsPDF }, { default: autoTable }] = await loadExportDeps([
    () => import("jspdf"),
    () => import("jspdf-autotable"),
  ]);
  // Narrow reports look better in portrait; wide ones need landscape.
  const landscape = columns.length > 6;
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Embed the Unicode font so amounts print the REAL ₱. If it can't be
  // loaded, fall back to Helvetica + "PHP " text (still readable).
  let uniFont = null; // "NotoSans" when embedded
  try {
    const b64 = await getReportFontB64();
    if (b64) {
      doc.addFileToVFS("NotoSans-Report.ttf", b64);
      doc.addFont("NotoSans-Report.ttf", "NotoSans", "normal");
      uniFont = "NotoSans";
    }
  } catch { /* keep Helvetica fallback */ }
  const bodyFont = uniFont || "helvetica";
  // Text helper: pass through the real ₱ when the font is embedded, else
  // swap ₱→"PHP " so Helvetica doesn't print a blank box. Either way, strip
  // glyphs the subset font can't shape (see stripUnsafePdfGlyphs above).
  const tx = (s) => stripUnsafePdfGlyphs(uniFont ? String(s ?? "") : pdfSafe(s));

  // Letterhead (page 1)
  const logo = await getLogoDataUrl();
  if (logo) { try { doc.addImage(logo, "PNG", 14, 9, 17, 17); } catch { /* skip logo */ } }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...GREEN);
  doc.text(ORG, pageW / 2, 16, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  doc.text(ADDR, pageW / 2, 21, { align: "center" });

  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.6);
  doc.line(14, 25, pageW - 14, 25);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text(title, pageW / 2, 32, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  let hy = 37.5;
  if (subtitle) { doc.text(stripUnsafePdfGlyphs(pdfSafe(subtitle)), pageW / 2, hy, { align: "center" }); hy += 5; }
  const periodLabel = periodLabelOverride || ((fromDate || toDate)
    ? `For the period: ${fmtDate(fromDate)} to ${fmtDate(toDate)}`
    : "All records");
  doc.text(stripUnsafePdfGlyphs(pdfSafe(periodLabel)), pageW / 2, hy, { align: "center" }); hy += 4.5;
  doc.text(pdfSafe(`${rows.length} row(s) - Generated ${new Date().toLocaleString()}`), pageW / 2, hy, { align: "center" });

  // Table — body uses the embedded Unicode font (real ₱); the header row
  // stays Helvetica-bold (ASCII headers) for a crisp bold look.
  const head = [columns.map((c) => tx(c.header))];
  const body = rows.map((r) => columns.map((c) => tx(cellValue(c, r))));

  autoTable(doc, {
    startY: hy + 5,
    head,
    body,
    theme: "grid",
    styles: { font: bodyFont, fontSize: 8, cellPadding: 1.6, lineColor: [226, 232, 240], lineWidth: 0.1, textColor: INK },
    headStyles: { font: "helvetica", fillColor: GREEN, textColor: 255, fontStyle: "bold", halign: "center", lineWidth: 0 },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles: columns.reduce((acc, c, i) => {
      if (c.align === "right") acc[i] = { halign: "right" };
      return acc;
    }, {}),
    margin: { left: 10, right: 10, bottom: 16 },
    rowPageBreak: "avoid",
    // A multi-meter/multi-period receipt (one OR, several lines) prints as a
    // bold "main" row (combined due/received + the true OR-level CBU total)
    // followed by its own lightly-tinted sub-rows underneath — same grouping
    // as the on-screen Transactions view, just flattened for a printed table.
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const r = rows[data.row.index];
      if (r?._isGroupMain) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = GROUP_TOTAL_BG;
        data.cell.styles.textColor = GROUP_TOTAL_INK;
      } else if (r?._isSubRow) {
        data.cell.styles.fillColor = SUBROW_BG;
        data.cell.styles.textColor = SLATE;
      }
    },
  });

  // Bordered totals box (bottom-right)
  let cursorY = doc.lastAutoTable.finalY + 7;
  if (totals && totals.length) {
    const boxW = landscape ? 95 : 80;
    const boxX = pageW - 14 - boxW;
    const lineH = 5.5;
    const boxH = 7 + totals.length * lineH + 2;
    if (cursorY + boxH > pageH - 30) { doc.addPage(); cursorY = 18; }
    doc.setDrawColor(...GREEN);
    doc.setLineWidth(0.4);
    doc.setFillColor(...ZEBRA);
    doc.roundedRect(boxX, cursorY, boxW, boxH, 1.5, 1.5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...GREEN);
    doc.text("SUMMARY", boxX + 3, cursorY + 5);
    let ty = cursorY + 5 + lineH;
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    totals.forEach((t, i) => {
      const emphasize = i === totals.length - 1;
      // Label: Helvetica (bold for the emphasized last line). Value: the
      // embedded Unicode font so the ₱ amount renders correctly.
      doc.setFont("helvetica", emphasize ? "bold" : "normal");
      doc.text(stripUnsafePdfGlyphs(pdfSafe(t.label)), boxX + 3, ty);
      doc.setFont(bodyFont, "normal");
      doc.text(tx(t.value), boxX + boxW - 3, ty, { align: "right" });
      ty += lineH;
    });
    doc.setFont("helvetica", "normal");
    cursorY += boxH + 8;
  }

  // Signature blocks
  if (cursorY > pageH - 34) { doc.addPage(); cursorY = 20; }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  const sig = [["Prepared by:", preparedBy || ""], ["Verified by:", ""], ["Approved by:", ""]];
  const colW = (pageW - 28) / sig.length;
  sig.forEach(([label, name], i) => {
    const x = 14 + colW * i;
    if (name) doc.text(name, x + (colW - 6) / 2, cursorY + 13, { align: "center" });
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.2);
    doc.line(x, cursorY + 14, x + colW - 6, cursorY + 14);
    doc.text(label, x, cursorY + 19);
  });

  // Footer "Page X of Y" on every page
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`${ORG} — confidential`, 14, pageH - 6);
    doc.text(`Page ${i} of ${pages}`, pageW - 14, pageH - 6, { align: "right" });
  }

  doc.save(filename || `${title.replace(/\s+/g, "_")}.pdf`);
}

// ─── Excel (.xlsx, styled, with real numeric cells) ───────────────────

export async function exportExcel({
  title,
  subtitle,
  fromDate,
  toDate,
  periodLabel: periodLabelOverride,
  preparedBy,
  columns,
  rows,
  totals,
  filename,
}) {
  const [{ default: ExcelJS }] = await loadExportDeps([() => import("exceljs")]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "POWASSCO";
  wb.created = new Date();
  const ws = wb.addWorksheet((title || "Report").slice(0, 28).replace(/[\\/?*[\]:]/g, " "), {
    pageSetup: { orientation: columns.length > 6 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const nCol = columns.length;
  const colLetter = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const span = (rowNum) => `A${rowNum}:${colLetter(nCol)}${rowNum}`;

  // Title block (merged, centered)
  const titleLines = [
    { t: ORG, font: { bold: true, size: 15, color: { argb: "FF166534" } } },
    { t: ADDR, font: { size: 9, color: { argb: "FF475569" } } },
    { t: title, font: { bold: true, size: 12, color: { argb: "FF0F172A" } } },
  ];
  if (subtitle) titleLines.push({ t: subtitle, font: { size: 9, italic: true, color: { argb: "FF475569" } } });
  titleLines.push({ t: periodLabelOverride || ((fromDate || toDate) ? `For the period: ${fmtDate(fromDate)} to ${fmtDate(toDate)}` : "All records"), font: { size: 9, color: { argb: "FF475569" } } });
  titleLines.push({ t: `${rows.length} row(s) • Generated ${new Date().toLocaleString()}`, font: { size: 8, color: { argb: "FF94A3B8" } } });

  for (const line of titleLines) {
    const row = ws.addRow([line.t]);
    ws.mergeCells(span(row.number));
    const cell = row.getCell(1);
    cell.font = line.font;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  }
  ws.addRow([]); // spacer

  // Header row
  const headerRow = ws.addRow(columns.map((c) => c.header));
  headerRow.height = 18;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  ws.views = [{ state: "frozen", ySplit: headerRow.number }];

  // Body rows — keep numbers as numbers so they sum/pivot in Excel.
  for (const r of rows) {
    const values = columns.map((c) => {
      const raw = r[c.key];
      if (isNumericCol(c) && typeof raw === "number" && Number.isFinite(raw)) return raw;
      return String(cellValue(c, r));
    });
    const row = ws.addRow(values);
    // A multi-meter/multi-period receipt (one OR, several lines) fills its
    // bold "main" row blue and its own sub-rows a light gray underneath —
    // same grouping as the on-screen Transactions view.
    const isGroupMain = !!r._isGroupMain;
    const isSubRow = !!r._isSubRow;
    row.eachCell((cell, col) => {
      const c = columns[col - 1];
      cell.border = { top: { style: "hair", color: { argb: "FFE2E8F0" } } };
      if (c.align === "right") cell.alignment = { horizontal: "right" };
      if (typeof cell.value === "number") cell.numFmt = '"₱"#,##0.00';
      if (isGroupMain) {
        cell.font = { bold: true, color: { argb: "FF1E40AF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
      } else if (isSubRow) {
        cell.font = { color: { argb: "FF64748B" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
    });
  }

  // Totals
  if (totals && totals.length) {
    ws.addRow([]);
    totals.forEach((t, i) => {
      const row = ws.addRow([t.label, t.value]);
      const emphasize = i === totals.length - 1;
      row.getCell(1).font = { bold: true, color: emphasize ? { argb: "FF166534" } : undefined };
      row.getCell(2).font = { bold: true };
      row.getCell(2).alignment = { horizontal: "left" };
    });
  }

  // Signature line
  ws.addRow([]);
  const sigRow = ws.addRow([`Prepared by: ${preparedBy || "______________"}`, "", "Verified by: ______________", "", "Approved by: ______________"]);
  sigRow.eachCell((cell) => { cell.font = { size: 9, color: { argb: "FF475569" } }; });

  // Auto-fit column widths from content
  columns.forEach((c, i) => {
    let max = String(c.header).length;
    for (const r of rows) {
      const v = cellValue(c, r);
      const len = (typeof v === "number" ? peso(v) : String(v)).length;
      if (len > max) max = len;
    }
    ws.getColumn(i + 1).width = Math.min(Math.max(max + 2, 10), 42);
  });

  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename || `${title.replace(/\s+/g, "_")}.xlsx`
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────

export const reportFormatters = { peso, date: fmtDate, dateTime: fmtDateTime };
