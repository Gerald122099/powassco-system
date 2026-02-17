// InvoiceReceipt.jsx
import { useRef, useEffect, useState } from "react";
import Modal from "./Modal";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";

function money(n) {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateString) {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatPeriod(periodKey) {
  if (!periodKey || !periodKey.includes("-")) return periodKey;
  const [year, month] = periodKey.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function InvoiceReceipt({ bill, payment, onClose, open }) {
  const { token } = useAuth();
  const printRef = useRef();
  const [enhancedBill, setEnhancedBill] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch complete bill details when modal opens
  useEffect(() => {
    const fetchBillDetails = async () => {
      if (!open || !bill || !bill._id) return;
      
      setLoading(true);
      try {
        const response = await apiFetch(`/water/bills/${bill._id}`, { token });
        if (response) {
          setEnhancedBill(response);
        } else {
          setEnhancedBill(bill);
        }
      } catch (error) {
        console.error("Error fetching bill details:", error);
        setEnhancedBill(bill);
      } finally {
        setLoading(false);
      }
    };

    fetchBillDetails();
  }, [open, bill, token]);

  const handlePrint = () => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const printContent = document.getElementById("receipt-content");
    if (!printContent) return;

    const iframeDoc = iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(`
      <html>
        <head>
          <title>Receipt - ${bill?.pnNo || ''}</title>
          <style>
            @page {
              size: 58mm 297mm;
              margin: 2mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              font-family: 'Courier New', 'Lucida Console', monospace;
              font-size: 10px;
              line-height: 1.3;
              width: 58mm;
              margin: 0 auto;
              padding: 2mm;
              background: white;
              color: #000;
            }
            .receipt {
              width: 100%;
            }
            .header {
              text-align: center;
              margin-bottom: 4px;
              padding-bottom: 4px;
              border-bottom: 1px dashed #000;
            }
            .header h1 {
              font-size: 12px;
              font-weight: bold;
              letter-spacing: 0.5px;
              margin-bottom: 2px;
            }
            .header h2 {
              font-size: 10px;
              font-weight: bold;
            }
            .header p {
              font-size: 8px;
            }
            .divider {
              border-top: 1px dashed #000;
              margin: 4px 0;
            }
            .row {
              display: flex;
              justify-content: space-between;
              margin: 2px 0;
            }
            .grid-2 {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 2px;
            }
            .label {
              font-weight: bold;
            }
            .text-center {
              text-align: center;
            }
            .text-right {
              text-align: right;
            }
            .text-large {
              font-size: 12px;
              font-weight: bold;
            }
            .reading-row {
              display: flex;
              justify-content: space-between;
              border: 1px solid #000;
              padding: 3px;
              margin: 4px 0;
              font-weight: bold;
            }
            .reading-item {
              text-align: center;
              flex: 1;
            }
            .total-row {
              display: flex;
              justify-content: space-between;
              font-weight: bold;
              font-size: 11px;
              margin: 4px 0;
              padding: 2px 0;
            }
            .amount-due {
              background: #000;
              color: #fff;
              padding: 4px;
              margin: 4px 0;
            }
            .amount-due .row {
              color: #fff;
            }
            .footer {
              text-align: center;
              margin-top: 6px;
              padding-top: 4px;
              border-top: 1px dashed #000;
              font-size: 8px;
            }
          </style>
        </head>
        <body>
          ${printContent.outerHTML}
        </body>
      </html>
    `);
    iframeDoc.close();

    iframe.contentWindow.onload = function() {
      iframe.contentWindow.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    };
  };

  useEffect(() => {
    if (open && bill && payment) {
      setTimeout(() => {
        const printBtn = document.getElementById('print-receipt-btn');
        if (printBtn) printBtn.focus();
      }, 100);
    }
  }, [open, bill, payment]);

  if (!bill || !payment) return null;

  const displayBill = enhancedBill || bill;

  // Essential data only
  const consumption = displayBill.consumed || 0;
  const previousReading = displayBill.previousReading || 0;
  const presentReading = displayBill.presentReading || 0;
  const hasDiscount = displayBill.discount > 0;
  const hasPenalty = displayBill.penaltyApplied > 0;
  const isSenior = displayBill.memberSnapshot?.isSeniorCitizen;
  const baseAmount = displayBill.baseAmount || displayBill.amount || 0;

  // Get tariff info
  const tariffTier = displayBill.tariffUsed?.tier || '';
  const tariffRate = displayBill.tariffUsed?.ratePerCubic || 0;

  return (
    <Modal open={open} title="Receipt" onClose={onClose} size="sm">
      <div className="space-y-3">
        {loading && (
          <div className="text-center py-2 text-sm text-blue-600">
            Loading...
          </div>
        )}
        
        {/* Thermal Receipt Content - 58mm width */}
        <div 
          id="receipt-content" 
          ref={printRef} 
          className="bg-white p-2 mx-auto border border-gray-200"
          style={{ 
            maxWidth: '58mm', 
            fontFamily: "'Courier New', monospace",
            fontSize: '10px'
          }}
        >
          {/* Header */}
          <div className="header">
            <h1>POWASSCO</h1>
            <p>Brgy. Owak, Asturias, Cebu</p>
            <div className="divider"></div>
            <h2>OFFICIAL RECEIPT</h2>
          </div>

          {/* OR Info */}
          <div className="row">
            <span>OR#: {payment.orNo?.slice(-8) || '—'}</span>
            <span>{formatDate(payment.paidAt)}</span>
          </div>

          {/* Account Info - Compact */}
          <div className="divider"></div>
          <div className="row">
            <span>PN: {displayBill.pnNo}</span>
            <span>Mtr: {displayBill.meterNumber}</span>
          </div>
          <div className="row">
            <span>{displayBill.accountName?.substring(0, 18)}</span>
            <span>{formatPeriod(displayBill.periodCovered)}</span>
          </div>

          {/* Meter Readings - Prominent */}
          <div className="reading-row">
            <div className="reading-item">
              <div>PREV</div>
              <div>{previousReading.toFixed(1)}</div>
            </div>
            <div className="reading-item">
              <div>PRES</div>
              <div>{presentReading.toFixed(1)}</div>
            </div>
            <div className="reading-item">
              <div>USE</div>
              <div>{consumption.toFixed(1)}</div>
            </div>
          </div>

          {/* Tariff (if applicable) */}
          {tariffTier && (
            <div className="row">
              <span>Rate: {tariffTier}</span>
              <span>@ ₱{tariffRate.toFixed(2)}</span>
            </div>
          )}

          {/* Charges */}
          <div className="divider"></div>
          <div className="row">
            <span>Base Amt ({consumption.toFixed(1)} m³)</span>
            <span>₱{money(baseAmount)}</span>
          </div>
          
          {hasDiscount && (
            <div className="row">
              <span>Discount{isSenior ? ' (SC)' : ''}</span>
              <span>-₱{money(displayBill.discount)}</span>
            </div>
          )}
          
          {hasPenalty && (
            <div className="row">
              <span>Penalty</span>
              <span>+₱{money(displayBill.penaltyApplied)}</span>
            </div>
          )}

          {/* Amount Due - Highlighted */}
          <div className="amount-due">
            <div className="row">
              <span className="text-large">TOTAL DUE</span>
              <span className="text-large">₱{money(displayBill.totalDue)}</span>
            </div>
          </div>

          {/* Payment */}
          <div className="row">
            <span>AMOUNT PAID</span>
            <span className="text-large">₱{money(payment.amountPaid)}</span>
          </div>
          
          {payment.change > 0 && (
            <div className="row">
              <span>CHANGE</span>
              <span>₱{money(payment.change)}</span>
            </div>
          )}

          {/* Payment Method */}
          <div className="row">
            <span>Payment: {payment.method?.toUpperCase() || 'CASH'}</span>
            <span>By: {payment.receivedBy?.substring(0, 5) || 'SYS'}</span>
          </div>

          {/* OR Number */}
          <div className="text-center" style={{fontSize: '12px', margin: '4px 0'}}>
            {payment.orNo}
          </div>

          {/* Footer */}
          <div className="footer">
            <div>THANK YOU!</div>
            <div>{new Date().toLocaleString()}</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium hover:bg-gray-50"
          >
            Close
          </button>
          <button
            id="print-receipt-btn"
            onClick={handlePrint}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>
        </div>
      </div>
    </Modal>
  );
}