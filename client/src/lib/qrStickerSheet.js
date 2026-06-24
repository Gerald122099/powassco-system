import QRCode from "qrcode";
import { encodeMeterQR } from "./meterQr";
import { printHtmlDoc } from "./printHtmlDoc";

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Generates a printable sheet of QR stickers, one per meter. Each sticker has
// the QR plus the PN, meter number, and account name printed below for manual
// fallback. `meters`: [{ pnNo, meterNumber, accountName }]
export async function printMeterStickers(meters) {
  if (!meters || meters.length === 0) {
    alert("No meters to print.");
    return;
  }

  const cells = await Promise.all(
    meters.map(async (m) => {
      const url = await QRCode.toDataURL(encodeMeterQR(m.pnNo, m.meterNumber), { width: 220, margin: 1, errorCorrectionLevel: "M" });
      return { ...m, url };
    })
  );

  const cellsHtml = cells
    .map(
      (c) => `
      <div class="sticker">
        <div class="coop">POWASSCO</div>
        <img src="${c.url}" alt="QR"/>
        <div class="id">${esc(c.pnNo)} &bull; ${esc(c.meterNumber)}</div>
        <div class="nm">${esc(c.accountName)}</div>
        <div class="hint">Scan to encode reading</div>
      </div>`
    )
    .join("");

  printHtmlDoc(`<!doctype html><html><head><meta charset="utf-8"/><title>Meter QR Stickers (${cells.length})</title>
    <style>
      @page { size: A4; margin: 8mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; margin: 0; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; }
      .sticker { border: 1px dashed #94a3b8; border-radius: 8px; padding: 6px; text-align: center; break-inside: avoid; }
      .coop { font-size: 10px; font-weight: 800; color: #166534; }
      .sticker img { width: 34mm; height: 34mm; }
      .id { font-size: 12px; font-weight: 800; letter-spacing: .3px; color: #0f172a; }
      .nm { font-size: 10px; color: #475569; min-height: 12px; }
      .hint { font-size: 8px; color: #94a3b8; margin-top: 1px; }
    </style></head><body>
      <div class="grid">${cellsHtml}</div>
    </body></html>`);
}
