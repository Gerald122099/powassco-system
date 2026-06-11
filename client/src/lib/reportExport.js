// Report export helpers — PDF (jsPDF + autotable) and CSV (file-saver).
// Used by the cashier + bookkeeper Reports panels.
//
// Header format mimics the cooperative's Treasurer's Report layout:
//   POWASSCO MULTIPURPOSE COOPERATIVE
//   Owak, Asturias, Cebu • C.D.A Reg. No. 9520-07014753
//   [Report Title]
//   For the period: <from> – <to>
//
// followed by a single landscape table and signature blocks at the bottom.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { saveAs } from "file-saver";

const peso = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" }) : "—");
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—");

// ─── PDF ──────────────────────────────────────────────────────────────

export function exportPdf({
  title,
  fromDate,
  toDate,
  preparedBy,
  columns,    // [{ header, key, align?, format?(v) }]
  rows,       // raw row objects
  totals,     // { label, value } pairs
  filename,
}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(22, 101, 52); // green-800
  doc.text("POWASSCO MULTIPURPOSE COOPERATIVE", pageW / 2, 15, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text("Owak, Asturias, Cebu • C.D.A Reg. No. 9520-07014753", pageW / 2, 21, { align: "center" });

  doc.setDrawColor(22, 101, 52);
  doc.setLineWidth(0.6);
  doc.line(14, 24, pageW - 14, 24);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(title, pageW / 2, 31, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const periodLabel = (fromDate || toDate)
    ? `For the period: ${fmtDate(fromDate) || "—"} to ${fmtDate(toDate) || "—"}`
    : "All transactions";
  doc.text(periodLabel, pageW / 2, 37, { align: "center" });
  doc.text(`Generated ${new Date().toLocaleString()}`, pageW / 2, 42, { align: "center" });

  // Body table
  const head = [columns.map((c) => c.header)];
  const body = rows.map((r) =>
    columns.map((c) => {
      const raw = r[c.key];
      return c.format ? c.format(raw, r) : (raw ?? "—");
    })
  );

  autoTable(doc, {
    startY: 47,
    head,
    body,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [22, 101, 52], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: columns.reduce((acc, c, i) => {
      if (c.align === "right") acc[i] = { halign: "right" };
      return acc;
    }, {}),
    margin: { left: 10, right: 10 },
  });

  // Totals
  let cursorY = doc.lastAutoTable.finalY + 6;
  if (totals && totals.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    for (const t of totals) {
      doc.text(`${t.label}: ${t.value}`, pageW - 14, cursorY, { align: "right" });
      cursorY += 5;
    }
    cursorY += 4;
  }

  // Signature blocks
  if (cursorY > doc.internal.pageSize.getHeight() - 35) {
    doc.addPage();
    cursorY = 20;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const cols = 3;
  const colW = (pageW - 28) / cols;
  const labels = ["Prepared by:", "Verified by:", "Approved by:"];
  const names  = [preparedBy || "", "", ""];
  for (let i = 0; i < cols; i++) {
    const x = 14 + colW * i;
    doc.line(x, cursorY + 14, x + colW - 6, cursorY + 14);
    if (names[i]) {
      doc.setFont("helvetica", "bold");
      doc.text(names[i], x + (colW - 6) / 2, cursorY + 13, { align: "center" });
      doc.setFont("helvetica", "normal");
    }
    doc.text(labels[i], x, cursorY + 19);
  }

  doc.save(filename || `${title.replace(/\s+/g, "_")}.pdf`);
}

// ─── CSV (Excel-compatible) ───────────────────────────────────────────

function csvCell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportCsv({
  title,
  fromDate,
  toDate,
  columns,
  rows,
  totals,
  filename,
}) {
  const lines = [];
  lines.push(csvCell("POWASSCO MULTIPURPOSE COOPERATIVE"));
  lines.push(csvCell("Owak, Asturias, Cebu — C.D.A Reg. No. 9520-07014753"));
  lines.push(csvCell(title));
  if (fromDate || toDate) {
    lines.push(csvCell(`For the period: ${fmtDate(fromDate) || "all"} to ${fmtDate(toDate) || "all"}`));
  }
  lines.push(csvCell(`Generated: ${new Date().toLocaleString()}`));
  lines.push(""); // blank row

  // Header row
  lines.push(columns.map((c) => csvCell(c.header)).join(","));
  // Body rows
  for (const r of rows) {
    lines.push(columns.map((c) => {
      const raw = r[c.key];
      const v = c.format ? c.format(raw, r) : raw;
      return csvCell(v);
    }).join(","));
  }

  if (totals && totals.length) {
    lines.push("");
    for (const t of totals) {
      lines.push(`${csvCell(t.label)},${csvCell(t.value)}`);
    }
  }

  const csv = "﻿" + lines.join("\r\n"); // BOM for Excel UTF-8
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  saveAs(blob, filename || `${title.replace(/\s+/g, "_")}.csv`);
}

// ─── Shared helpers ───────────────────────────────────────────────────

export const reportFormatters = {
  peso,
  date: fmtDate,
  dateTime: fmtDateTime,
};
