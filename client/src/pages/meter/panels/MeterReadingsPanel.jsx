// MeterReadingsPanel.jsx (COMPLETE with Batch Management Tab)
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Card from "../../../components/Card";
import Modal from "../../../components/Modal";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";
import {
  Printer,
  Download,
  FileText,
  Search,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Edit,
  Eye,
  AlertCircle,
  RefreshCw,
  Save,
  XCircle,
  History,
  FileSpreadsheet,
  Lock,
  Unlock,
  TrendingUp,
  Calendar,
  User,
  MapPin,
  FileText as FileTextIcon,
  DollarSign,
  Percent,
  PenTool,
  ArrowLeft,
  ArrowRight,
  Clock,
} from "lucide-react";
import BatchManagementPanel from "./BatchManagementPanel";

const PAGE_SIZE = 10;

// Helper functions
const safeUpper = (v) => String(v || "").toUpperCase().trim();
const safeStr = (v) => String(v || "").trim();
const formatNumber = (num, decimals = 3) => {
  const n = Number(num || 0);
  return Number.isFinite(n) ? n.toFixed(decimals) : "0.000";
};

export default function MeterReadingsPanel() {
  const { token, user } = useAuth();

  // States
  const [activeTab, setActiveTab] = useState("readings"); // "readings" or "batches"
  const [searchTerm, setSearchTerm] = useState("");
  const [periodKey, setPeriodKey] = useState(new Date().toISOString().slice(0, 7));
  const [previousPeriodKey, setPreviousPeriodKey] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().slice(0, 7);
  });
  
  const [members, setMembers] = useState([]);
  const [readings, setReadings] = useState({}); // Current period readings (input)
  const [previousReadings, setPreviousReadings] = useState({}); // Previous period readings (for display)
  const [savedReadings, setSavedReadings] = useState({}); // Saved readings for current period
  const [billsForPeriod, setBillsForPeriod] = useState({}); // pnNo-meter -> bill info for CURRENT period only
  const [expandedMeters, setExpandedMeters] = useState({});
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedMemberForHistory, setSelectedMemberForHistory] = useState(null);
  const [showBillDetails, setShowBillDetails] = useState(false);
  const [selectedBillForView, setSelectedBillForView] = useState(null);

  const [selectedMember, setSelectedMember] = useState(null);
  const [preview, setPreview] = useState(null);
  const [receiptData, setReceiptData] = useState(null);
  const [selectedBill, setSelectedBill] = useState(null);
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [memberBills, setMemberBills] = useState([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const [editingMeters, setEditingMeters] = useState({});

  const [batchMode, setBatchMode] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({
    total: 0,
    read: 0,
    unread: 0,
    anyRead: 0,
  });

  const [waterSettings, setWaterSettings] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchInputValue, setSearchInputValue] = useState("");

  const receiptRef = useRef();
  const searchTimeoutRef = useRef(null);

  // Check if user can edit
  const canEdit = user?.role === "admin" || user?.role === "water_bill_officer" || user?.role === "meter_reader";

  // ---------- helpers ----------
  const getActiveBillingMeters = (member) => {
    return (member?.meters || []).filter((m) => m?.meterStatus === "active" && m?.isBillingActive === true);
  };

  const hasAnyInputForMember = useCallback((member) => {
    const pn = member?.pnNo;
    if (!pn) return false;
    const active = member.activeBillingMeters || getActiveBillingMeters(member);
    if (!active.length) return false;

    return active.some((m) => {
      const val = readings[pn]?.[safeUpper(m.meterNumber)]?.presentReading;
      return safeStr(val) !== "";
    });
  }, [readings]);

  const hasCompleteInputForMember = useCallback((member) => {
    const pn = member?.pnNo;
    if (!pn) return false;
    const active = member.activeBillingMeters || getActiveBillingMeters(member);
    if (!active.length) return false;

    return active.every((m) => {
      const val = readings[pn]?.[safeUpper(m.meterNumber)]?.presentReading;
      return safeStr(val) !== "";
    });
  }, [readings]);

  const getMemberStatus = useCallback((member) => {
    if (member?.hasReading) return "complete";
    if (member?.hasAnyReading) return "partial";
    if (hasAnyInputForMember(member)) return "partial";
    return "unread";
  }, [hasAnyInputForMember]);

  const isMeterAlreadySaved = (member, meterNumber) => {
    const set = new Set((member?.readMeters || []).map((x) => safeUpper(x)));
    return set.has(safeUpper(meterNumber));
  };

  const getSavedReading = (member, meterNumber) => {
    const pn = member?.pnNo;
    if (!pn) return null;
    return savedReadings[pn]?.[safeUpper(meterNumber)];
  };

  // Get previous reading for a meter (from the most recent ACTUAL reading, even if there are gaps)
const getPreviousReading = useCallback((member, meterNumber) => {
  const pn = member?.pnNo;
  if (!pn) return null;
  
  const mn = safeUpper(meterNumber);
  
  // First try to get from the immediate previous month
  const immediatePrev = previousReadings[pn]?.[mn];
  if (immediatePrev) {
    return {
      presentReading: immediatePrev.presentReading,
      previousReading: immediatePrev.previousReading,
      consumed: immediatePrev.consumed,
      readAt: immediatePrev.readAt,
      periodKey: previousPeriodKey,
      source: "immediate_previous"
    };
  }
  
  // If no immediate previous, try to get from last actual reading data
  if (member.lastActualReadings && member.lastActualReadings[mn]) {
    const lastActual = member.lastActualReadings[mn];
    
    // CRITICAL FIX: Skip if the last actual reading is from the current period
    if (lastActual.periodKey === periodKey) {
      // This is from current period - we need to find an older one
      // For now, return null and let the caller handle it
      console.log(`Skipping current period reading in getPreviousReading`);
      return null;
    }
    
    // Last actual is from a previous period - use it
    return {
      presentReading: lastActual.presentReading,
      previousReading: lastActual.previousReading,
      consumed: lastActual.consumed,
      readAt: lastActual.readAt,
      periodKey: lastActual.periodKey,
      source: lastActual.source === "reading" ? "last_reading" : "last_paid_bill",
      isGap: lastActual.periodKey !== previousPeriodKey
    };
  }
  
  // Finally, fall back to meter's lastReading
  const meter = member.meters?.find(m => safeUpper(m.meterNumber) === mn);
  if (meter && meter.lastReading) {
    return {
      presentReading: meter.lastReading,
      readAt: meter.lastReadingDate,
      periodKey: "previous",
      source: "meter_last",
      isGap: true
    };
  }
  
  return null;
}, [previousReadings, previousPeriodKey, periodKey]);
  const isMeterInEditMode = useCallback((member, meterNumber) => {
    const key = `${member.pnNo}-${safeUpper(meterNumber)}`;
    return !!editingMeters[key];
  }, [editingMeters]);

  const toggleMeterEdit = (member, meterNumber) => {
    const key = `${member.pnNo}-${safeUpper(meterNumber)}`;
    setEditingMeters(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const validateReading = useCallback((member, meter, value) => {
    const pn = member.pnNo;
    const mn = safeUpper(meter.meterNumber);
    const errors = { ...validationErrors };
    
    if (isMeterInEditMode(member, meter.meterNumber)) {
      delete errors[`${pn}-${mn}`];
      setValidationErrors(errors);
      return true;
    }
    
    if (!value || value === "") {
      delete errors[`${pn}-${mn}`];
      setValidationErrors(errors);
      return true;
    }

    const num = parseFloat(value);

    if (!Number.isFinite(num)) {
      errors[`${pn}-${mn}`] = "Please enter a valid number";
      setValidationErrors(errors);
      return false;
    }

    if (num < 0) {
      errors[`${pn}-${mn}`] = "Reading cannot be negative";
      setValidationErrors(errors);
      return false;
    }

    delete errors[`${pn}-${mn}`];
    setValidationErrors(errors);
    return true;
  }, [validationErrors, isMeterInEditMode]);

  // Get bill status for a meter for CURRENT period only
  const getMeterBillStatus = useCallback((pnNo, meterNumber) => {
    const key = `${pnNo}-${safeUpper(meterNumber)}`;
    return billsForPeriod[key];
  }, [billsForPeriod]);

  // Update previous period when current period changes
  useEffect(() => {
    const date = new Date(periodKey + "-01");
    date.setMonth(date.getMonth() - 1);
    setPreviousPeriodKey(date.toISOString().slice(0, 7));
  }, [periodKey]);

  // ---------- load water settings ----------
  useEffect(() => {
    loadWaterSettings();
  }, []);

  const loadWaterSettings = async () => {
    try {
      const settings = await apiFetch("/water/settings", { token });
      setWaterSettings(settings);
    } catch (error) {
      console.error("Failed to load water settings:", error);
    }
  };

  // ---------- load bills for the CURRENT period only ----------
  const loadBillsForPeriod = async (pnNos) => {
    if (!periodKey || !pnNos || pnNos.length === 0) {
      setBillsForPeriod({});
      return;
    }
    
    try {
      // Clear existing bills first
      setBillsForPeriod({});
      
      // Build query with periodKey filter
      const pnNosParam = pnNos.join(',');
      const response = await apiFetch(
        `/water/bills?periodKey=${periodKey}&pnNos=${pnNosParam}`,
        { token }
      );
      
      const billMap = {};
      (response.items || []).forEach(bill => {
        const key = `${bill.pnNo}-${safeUpper(bill.meterNumber)}`;
        billMap[key] = {
          id: bill._id,
          status: bill.status,
          totalDue: bill.totalDue,
          baseAmount: bill.baseAmount,
          discount: bill.discount,
          penaltyApplied: bill.penaltyApplied,
          period: bill.periodCovered,
          consumed: bill.consumed,
          previousReading: bill.previousReading,
          presentReading: bill.presentReading,
          hasReading: !!(bill.previousReading || bill.presentReading)
        };
      });
      
      setBillsForPeriod(billMap);
    } catch (error) {
      console.error("Failed to load bills:", error);
      setBillsForPeriod({});
    }
  };

  // ---------- load previous period readings (the month before current) ----------
  const loadPreviousReadings = async (pnNos) => {
    if (!previousPeriodKey || !pnNos || pnNos.length === 0) return;
    
    try {
      const response = await apiFetch(
        `/water/readings?periodKey=${previousPeriodKey}`,
        { token }
      );
      
      const readingsMap = {};
      if (response.readings) {
        response.readings.forEach(r => {
          if (!readingsMap[r.pnNo]) readingsMap[r.pnNo] = {};
          readingsMap[r.pnNo][safeUpper(r.meterNumber)] = {
            presentReading: r.presentReading,
            previousReading: r.previousReading,
            consumed: r.consumed,
            readingId: r._id,
            readAt: r.readAt,
            readBy: r.readBy,
          };
        });
      }
      setPreviousReadings(readingsMap);
    } catch (error) {
      console.log("No previous readings found for period:", previousPeriodKey);
      setPreviousReadings({});
    }
  };

  // ---------- load current period readings (the selected month) ----------
  const loadCurrentReadings = async (pnNos) => {
    if (!periodKey || !pnNos || pnNos.length === 0) return;
    
    try {
      const response = await apiFetch(
        `/water/readings?periodKey=${periodKey}`,
        { token }
      );
      
      const savedMap = {};
      if (response.readings) {
        response.readings.forEach(r => {
          if (!savedMap[r.pnNo]) savedMap[r.pnNo] = {};
          savedMap[r.pnNo][safeUpper(r.meterNumber)] = {
            presentReading: r.presentReading,
            previousReading: r.previousReading,
            consumed: r.consumed,
            readingId: r._id,
            readAt: r.readAt,
            readBy: r.readBy,
            meterNumber: r.meterNumber,
          };
        });
      }
      setSavedReadings(savedMap);

      // Create readings state for current period
      const newReadings = {};
      
      pnNos.forEach(pn => {
        const member = members.find(m => m.pnNo === pn);
        if (!member) return;
        
        newReadings[pn] = {};
        
        // For each meter, set the present reading based on saved data
        member.activeBillingMeters.forEach(meter => {
          const mn = safeUpper(meter.meterNumber);
          
          if (savedMap[pn] && savedMap[pn][mn]) {
            // This month HAS a saved reading
            newReadings[pn][mn] = {
              presentReading: savedMap[pn][mn].presentReading.toString(),
            };
          } else {
            // This month has NO saved reading
            newReadings[pn][mn] = {
              presentReading: "",
            };
          }
        });
      });
      
      setReadings(newReadings);
    } catch (error) {
      console.log("No readings found for period:", periodKey);
      setSavedReadings({});
      
      // Initialize empty readings
      const newReadings = {};
      pnNos.forEach(pn => {
        const member = members.find(m => m.pnNo === pn);
        if (!member) return;
        
        newReadings[pn] = {};
        member.activeBillingMeters.forEach(meter => {
          const mn = safeUpper(meter.meterNumber);
          newReadings[pn][mn] = {
            presentReading: "",
          };
        });
      });
      setReadings(newReadings);
    }
  };

  // ---------- load members ----------
  const loadMembers = async () => {
    setLoading(true);
    try {
      const response = await apiFetch(
        `/water/readings/members?periodKey=${periodKey}&page=${page}&limit=${PAGE_SIZE}&search=${encodeURIComponent(
          searchTerm
        )}`,
        { token }
      );

      const processed = (response.items || []).map((member) => {
        const activeBillingMeters = getActiveBillingMeters(member);
        
        return {
          ...member,
          pnNo: member.pnNo,
          meters: member.meters || [],
          activeBillingMeters,
          hasMultipleMeters: activeBillingMeters.length > 1,
          totalMeters: (member.meters || []).length,
          activeMeters: activeBillingMeters.length,
          readMeters: member.readMeters || [],
          missingMeters: member.missingMeters || [],
          hasAnyReading: !!member.hasAnyReading,
          hasReading: !!member.hasReading,
          billsForPeriod: member.billsForPeriod || [],
          hasBillForAnyMeter: member.hasBillForAnyMeter || false,
          readingWithoutBill: member.readingWithoutBill || false,
          billWithoutReading: member.billWithoutReading || false,
          lastActualReadings: member.lastActualReadings || {} // Add last actual readings
        };
      });

      setMembers(processed);
      setTotalPages(response.totalPages || 1);

      setStats({
        total: response.total || processed.length || 0,
        read: response.readCount || 0,
        unread: response.unreadCount ?? 0,
        anyRead: response.anyReadCount ?? 0,
      });

      // Clear all period-specific states first
      setBillsForPeriod({});
      setSavedReadings({});
      setPreviousReadings({});
      setReadings({});
      
      // Then load new data for the selected period
      const pnNos = processed.map(m => m.pnNo);
      
      // Load bills for the CURRENT period only
      await loadBillsForPeriod(pnNos);
      
      // Load readings for both periods
      await loadPreviousReadings(pnNos);
      await loadCurrentReadings(pnNos);

    } catch (error) {
      console.error("Error loading members:", error);
      alert("Failed to load members: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // reload on period/page/search with cleanup
  useEffect(() => {
    // Clear all period-specific state when period changes
    setBillsForPeriod({});
    setSavedReadings({});
    setPreviousReadings({});
    setReadings({});
    setEditingMeters({});
    setValidationErrors({});
    
    loadMembers();
    
    // Cleanup function
    return () => {
      setBillsForPeriod({});
      setSavedReadings({});
      setPreviousReadings({});
      setReadings({});
      setEditingMeters({});
      setValidationErrors({});
    };
  }, [periodKey, page, searchTerm]);

  // Improved search with debounce
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchInputValue(value);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setSearchTerm(value);
      if (page !== 1) {
        setPage(1);
      }
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // ---------- load member bills ----------
  const loadMemberBills = async (member) => {
    setBillsLoading(true);
    try {
      const response = await apiFetch(
        `/water/bills?pnNo=${member.pnNo}&periodKey=${periodKey}`,
        { token }
      );
      setMemberBills(response.items || []);
      setSelectedMember(member);
    } catch (error) {
      console.error("Error loading member bills:", error);
      alert("Failed to load bills: " + error.message);
    } finally {
      setBillsLoading(false);
    }
  };

  // ---------- load reading history ----------
  const loadReadingHistory = async (member, meterNumber) => {
    try {
      const response = await apiFetch(
        `/water/readings/history?pnNo=${member.pnNo}&meterNumber=${meterNumber}`,
        { token }
      );
      return response.readings || [];
    } catch (error) {
      console.error("Error loading reading history:", error);
      return [];
    }
  };

  // ---------- view bill details ----------
  const viewBillDetails = async (pnNo, meterNumber) => {
    try {
      const key = `${pnNo}-${safeUpper(meterNumber)}`;
      const billInfo = billsForPeriod[key];
      
      if (billInfo && billInfo.id) {
        const bill = await apiFetch(`/water/bills/${billInfo.id}`, { token });
        setSelectedBillForView(bill);
        setShowBillDetails(true);
      }
    } catch (error) {
      console.error("Failed to load bill details:", error);
      alert("Failed to load bill details");
    }
  };

  // ---------- UI filter ----------
  const filteredMembers = useMemo(() => {
    let list = [...members];

    if (statusFilter !== "all") {
      list = list.filter((m) => getMemberStatus(m) === statusFilter);
    }

    return list;
  }, [members, statusFilter, getMemberStatus]);

  // ---------- handlers ----------
  const handleReadingChange = (pnNo, meterNumber, value, isInitialLoad = false) => {
    const pn = safeUpper(pnNo);
    const mn = safeUpper(meterNumber);

    const member = members.find(m => safeUpper(m.pnNo) === pn);
    const meter = member?.meters?.find(m => safeUpper(m.meterNumber) === mn);
    
    if (member && meter && !isInitialLoad && value !== "") {
      validateReading(member, meter, value);
    }

    setReadings((prev) => ({
      ...prev,
      [pn]: {
        ...(prev[pn] || {}),
        [mn]: {
          ...(prev[pn]?.[mn] || {}),
          presentReading: value,
        },
      },
    }));
  };

  const toggleMeterExpansion = (pnNo) => {
    const pn = safeUpper(pnNo);
    setExpandedMeters((prev) => ({
      ...prev,
      [pn]: !prev[pn],
    }));
  };

  const resetMemberReadings = (member) => {
    const pn = member.pnNo;
    
    // Reset to saved values if they exist, otherwise empty
    const saved = savedReadings[pn];
    const newReadings = { ...readings };
    
    if (saved) {
      // Reset to saved values
      Object.keys(saved).forEach(mn => {
        if (!newReadings[pn]) newReadings[pn] = {};
        newReadings[pn][mn] = {
          presentReading: saved[mn].presentReading.toString(),
        };
      });
    } else if (newReadings[pn]) {
      // Clear all inputs for this member
      Object.keys(newReadings[pn]).forEach(mn => {
        newReadings[pn][mn] = {
          presentReading: "",
        };
      });
    }
    
    setReadings(newReadings);
    
    // Clear validation errors
    const newErrors = { ...validationErrors };
    Object.keys(newErrors).forEach(key => {
      if (key.startsWith(pn)) delete newErrors[key];
    });
    setValidationErrors(newErrors);

    // Clear edit mode
    const newEditing = { ...editingMeters };
    Object.keys(newEditing).forEach(key => {
      if (key.startsWith(pn)) delete newEditing[key];
    });
    setEditingMeters(newEditing);
  };

  const viewReadingHistory = async (member, meter) => {
    const history = await loadReadingHistory(member, meter.meterNumber);
    setSelectedMemberForHistory({
      member,
      meter,
      history
    });
    setShowHistory(true);
  };

  // ---------- preview ----------
  const previewSingleBill = async (member) => {
    setSelectedMember(member);

    const complete = hasCompleteInputForMember(member);
    if (!complete) {
      alert("Preview requires readings for ALL active meters. You can still Save Reading with partial readings.");
      return;
    }

    setLoading(true);
    try {
      const meterReadings = (member.activeBillingMeters || []).map((meter) => {
        const savedReading = getSavedReading(member, meter.meterNumber);
        const previousReadingData = getPreviousReading(member, meter.meterNumber);
        const previousReading = previousReadingData?.presentReading || meter.lastReading || 0;
        const presentReading = readings[member.pnNo]?.[safeUpper(meter.meterNumber)]?.presentReading || 
                              savedReading?.presentReading || 
                              0;
        
        return {
          meterNumber: meter.meterNumber,
          previousReading: previousReading,
          presentReading: parseFloat(presentReading),
          consumptionMultiplier: meter.consumptionMultiplier || 1,
        };
      });

      const totalConsumption = meterReadings.reduce((sum, r) => {
        return sum + (r.presentReading - r.previousReading) * r.consumptionMultiplier;
      }, 0);

      const data = await apiFetch("/water/bills/preview", {
        method: "POST",
        token,
        body: {
          pnNo: member.pnNo,
          periodKey,
          classification: member.billing?.classification || "residential",
          consumption: totalConsumption,
          meterReadings,
        },
      });

      if (data) {
        setPreview({
          ...data,
          member,
          meterReadings,
          totalConsumption,
        });
      } else {
        calculateLocalPreview(member, meterReadings, totalConsumption);
      }
    } catch (err) {
      console.error("preview error", err);
      calculateLocalPreview(member, [], 0);
    } finally {
      setLoading(false);
    }
  };

  const calculateLocalPreview = async (member, meterReadings, totalConsumption) => {
    try {
      if (!waterSettings) {
        alert("Water settings not loaded. Please try again.");
        return;
      }

      const classification = member.billing?.classification || "residential";
      const tariffs = waterSettings.tariffs?.[classification] || [];

      let amount = 0;
      let rateUsed = 0;
      let tariffTier = "";

      for (const tier of tariffs) {
        if (tier.isActive && totalConsumption >= tier.minConsumption && totalConsumption <= tier.maxConsumption) {
          amount = totalConsumption * (tier.ratePerCubic || 0);
          rateUsed = tier.ratePerCubic || 0;
          tariffTier = tier.tier || "";
          break;
        }
      }

      let discount = 0;
      if (member.personal?.isSeniorCitizen && waterSettings.seniorDiscount) {
        const applicableTiers = waterSettings.seniorDiscount.applicableTiers || [];
        const discountRate = waterSettings.seniorDiscount.discountRate || 0;
        if (applicableTiers.includes(tariffTier) && discountRate > 0) {
          discount = amount * (discountRate / 100);
          amount -= discount;
        }
      }

      setPreview({
        pnNo: member.pnNo,
        accountName: member.accountName,
        classification,
        periodKey,
        consumption: totalConsumption.toFixed(3),
        preview: {
          baseAmount: amount,
          amount,
          discount,
          discountReason: discount > 0 ? "Senior Discount" : "",
          tariffUsed: { tier: tariffTier, ratePerCubic: rateUsed },
        },
        member,
        meterReadings,
        totalConsumption,
      });
    } catch (e) {
      console.error(e);
      alert("Could not generate preview.");
    }
  };

  // ---------- save reading (with edit support) ----------
 const saveReading = async (member) => {
  const pn = member.pnNo;

  // Validate all inputs first
  let hasErrors = false;
  (member.activeBillingMeters || []).forEach((meter) => {
    const mn = safeUpper(meter.meterNumber);
    const input = readings[pn]?.[mn]?.presentReading;
    const inEditMode = isMeterInEditMode(member, meter.meterNumber);
    
    if (safeStr(input) !== "" && !inEditMode) {
      const isValid = validateReading(member, meter, input);
      if (!isValid) hasErrors = true;
    }
  });

  if (hasErrors) {
    alert("Please fix validation errors before saving.");
    return;
  }

  // Collect meters with input
  const toSend = (member.activeBillingMeters || [])
    .map((meter) => {
      const mn = safeUpper(meter.meterNumber);
      const input = readings[pn]?.[mn]?.presentReading;
      const savedReading = getSavedReading(member, meter.meterNumber);
      
      // FIXED: Get the correct previous reading
      let previousReading;
      
      // First try to get reading from the immediate previous month
      const immediatePrev = previousReadings[pn]?.[mn];
      
      if (immediatePrev) {
        // We have a reading from last month - use its present reading
        previousReading = immediatePrev.presentReading;
        console.log(`Using immediate previous: ${previousReading} from ${previousPeriodKey}`);
      } else {
        // No reading from last month - try to find the most recent reading
        // that is NOT from the current period
        const meterObj = member.meters?.find(m => safeUpper(m.meterNumber) === mn);
        
        if (member.lastActualReadings && member.lastActualReadings[mn]) {
          const lastActual = member.lastActualReadings[mn];
          
          // IMPORTANT: Check if this is from the current period
          if (lastActual.periodKey === periodKey) {
            // This is from current period - we need the previous reading from the saved reading
            // The saved reading should have the correct previous reading stored
            if (savedReading) {
              previousReading = savedReading.previousReading;
              console.log(`Using saved reading's previous: ${previousReading}`);
            } else {
              // Fallback to meter's last reading
              previousReading = meterObj?.lastReading || 0;
              console.log(`Using meter last reading: ${previousReading}`);
            }
          } else {
            // Last actual is from a previous period - use its present reading
            previousReading = lastActual.presentReading;
            console.log(`Using last actual: ${previousReading} from ${lastActual.periodKey}`);
          }
        } else {
          // No historical readings - use meter's last reading
          previousReading = meterObj?.lastReading || 0;
          console.log(`Using meter last reading (fallback): ${previousReading}`);
        }
      }
      
      const inEditMode = isMeterInEditMode(member, meter.meterNumber);
      
      if (safeStr(input) === "") return null;

      // Skip if it's the same as saved and not in edit mode
      if (savedReading && savedReading.presentReading.toString() === input && !inEditMode) {
        return null;
      }

      const pres = parseFloat(input);

      // Debug log to verify values
      console.log({
        meter: meter.meterNumber,
        previousReading,
        presentReading: pres,
        savedReading: savedReading?.presentReading,
        periodKey,
        previousPeriodKey
      });

      return {
        meterNumber: meter.meterNumber,
        previousReading: previousReading,
        presentReading: pres,
        consumptionMultiplier: meter.consumptionMultiplier || 1,
        readingId: savedReading?.readingId,
        forceUpdate: inEditMode,
      };
    })
    .filter(Boolean);

  if (toSend.length === 0) {
    alert("No changes to save.");
    return;
  }

  setLoading(true);
  try {
    // Use PUT for edits, POST for new
    const hasExisting = toSend.some(r => r.readingId);
    const method = hasExisting ? "PUT" : "POST";
    
    const response = await apiFetch("/water/readings", {
      method,
      token,
      body: {
        periodKey,
        pnNo: member.pnNo,
        meterReadings: toSend,
        generateBill: true,
        editMode: editMode,
        remarks: editMode ? "Edited reading" : "New reading",
      },
    });

    // Reload data to show the saved readings
    await loadMembers();

    alert(`Saved! ${response.bills?.length || 0} bills generated/updated.`);
  } catch (error) {
    alert("Error saving: " + error.message);
  } finally {
    setLoading(false);
  }
};
  // View bill details modal
  const viewBill = async (member) => {
    await loadMemberBills(member);
    setBillModalOpen(true);
  };

  const viewSpecificBill = (bill) => {
    setSelectedBill(bill);
  };

  // ---------- batch save ----------
  const saveBatchReadings = async () => {
    const items = [];

    members.forEach((member) => {
      const pn = member.pnNo;
      const active = member.activeBillingMeters || [];

      const meterReadings = active
        .map((meter) => {
          const mn = safeUpper(meter.meterNumber);
          const input = readings[pn]?.[mn]?.presentReading;
          const savedReading = getSavedReading(member, meter.meterNumber);
          const previousReadingData = getPreviousReading(member, meter.meterNumber);
          const previousReading = previousReadingData?.presentReading || meter.lastReading || 0;
          const inEditMode = isMeterInEditMode(member, meter.meterNumber);
          
          if (safeStr(input) === "") return null;

          if (savedReading && savedReading.presentReading.toString() === input && !inEditMode) {
            return null;
          }

          const pres = parseFloat(input);
          if (!Number.isFinite(pres)) return null;

          return {
            meterNumber: meter.meterNumber,
            previousReading: previousReading,
            presentReading: pres,
            consumptionMultiplier: meter.consumptionMultiplier || 1,
            readingId: savedReading?.readingId,
            forceUpdate: inEditMode,
          };
        })
        .filter(Boolean);

      if (meterReadings.length > 0) {
        items.push({
          periodKey,
          pnNo: pn,
          meterReadings,
          generateBill: true,
          editMode,
        });
      }
    });

    if (items.length === 0) {
      alert("No changes to save.");
      return;
    }

    if (!confirm(`Save ${items.length} members and update bills?`)) return;

    setLoading(true);
    try {
      const response = await apiFetch("/water/readings/batch", {
        method: "POST",
        token,
        body: { items },
      });

      await loadMembers();
      setReceiptData(response);
      alert(`Batch done. Success: ${response.success || 0}, Failed: ${response.failed || 0}`);
    } catch (e) {
      alert("Batch error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ---------- export CSV ----------
  const exportToCSV = async () => {
    try {
      setLoading(true);
      const response = await apiFetch(
        `/water/readings/export?periodKey=${periodKey}`,
        { token }
      );
      
      const readings = response.readings || [];
      
      if (readings.length === 0) {
        alert("No readings to export for this period.");
        return;
      }

      const headers = [
        "PN No",
        "Account Name",
        "Meter Number",
        "Previous Reading",
        "Present Reading",
        "Consumption",
        "Read Date",
        "Read By",
        "Status",
        "Has Bill",
        "Bill Status"
      ];

      const rows = readings.map(r => {
        const key = `${r.pnNo}-${safeUpper(r.meterNumber)}`;
        const billInfo = billsForPeriod[key];
        
        return [
          r.pnNo,
          r.accountName || "",
          r.meterNumber,
          r.previousReading,
          r.presentReading,
          r.consumed,
          r.readAt ? new Date(r.readAt).toLocaleDateString() : "",
          r.readBy || "",
          r.readingStatus || "verified",
          billInfo ? "Yes" : "No",
          billInfo?.status || ""
        ];
      });

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `meter_readings_${periodKey}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export error:", e);
      alert("CSV export failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ---------- print ----------
  const printReceipt = () => {
    if (!receiptRef.current) return;

    const w = window.open("", "_blank");
    w.document.write(`
      <html>
        <head>
          <title>Batch Result</title>
          <style>
            @media print {
              body { margin:0; font-family: Arial, sans-serif; }
              .receipt { width: 80mm; margin: 0 auto; padding: 10px; }
              .header { text-align:center; border-bottom: 1px dashed #000; padding-bottom:10px; margin-bottom:10px; }
              .success { color: #059669; }
              .error { color: #dc2626; }
              table { width:100%; border-collapse: collapse; font-size: 10px; }
              th, td { border: 1px solid #e2e8f0; padding: 4px; text-align: left; }
              th { background: #f1f5f9; }
              @page { margin:0; }
            }
          </style>
        </head>
        <body>${receiptRef.current.innerHTML}</body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  const batchCount = useMemo(() => {
    let count = 0;
    Object.keys(readings).forEach(pn => {
      const member = members.find(m => safeUpper(m.pnNo) === pn);
      if (member) {
        const active = member.activeBillingMeters || [];
        active.forEach(meter => {
          const mn = safeUpper(meter.meterNumber);
          const input = readings[pn]?.[mn]?.presentReading;
          const savedReading = getSavedReading(member, meter.meterNumber);
          const inEditMode = isMeterInEditMode(member, meter.meterNumber);
          const billStatus = getMeterBillStatus(member.pnNo, meter.meterNumber);
          
          // Don't count if bill is paid and not in edit mode
          if (billStatus?.status === "paid" && !inEditMode) return;
          
          if (safeStr(input) !== "") {
            if (inEditMode || !savedReading || savedReading.presentReading.toString() !== input) {
              count++;
            }
          }
        });
      }
    });
    return count;
  }, [readings, members, savedReadings, isMeterInEditMode, getMeterBillStatus]);

  return (
    <Card>
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-lg font-black text-slate-900">Meter Reading & Bill Generation</div>
            <div className="text-xs text-slate-600 mt-1 flex items-center gap-2 flex-wrap">
              {editMode ? (
                <span className="text-amber-600 font-semibold flex items-center gap-1">
                  <PenTool size={12} />
                  Edit Mode - Click lock icon to edit current month's reading
                </span>
              ) : (
                <>
                  <span className="text-blue-600">Previous shows last ACTUAL reading (may have gaps).</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-green-600">Enter present reading for this month.</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-purple-600">Purple badges show bills for current period.</span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <button
                onClick={() => setEditMode(!editMode)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                  editMode 
                    ? "bg-amber-600 text-white hover:bg-amber-700 shadow-lg ring-2 ring-amber-200" 
                    : "border border-slate-200 hover:bg-slate-50"
                }`}
                disabled={loading}
              >
                <Edit size={16} />
                {editMode ? "Edit Mode ON" : "Edit Mode OFF"}
              </button>
            )}

            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
              disabled={loading}
            >
              <FileSpreadsheet size={16} />
              Export CSV
            </button>

            <button
              onClick={() => setBatchMode((s) => !s)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                batchMode ? "bg-purple-600 text-white hover:bg-purple-700 shadow-lg ring-2 ring-purple-200" : "border border-slate-200 hover:bg-slate-50"
              }`}
              disabled={loading}
            >
              <FileText size={16} />
              {batchMode ? "Batch Mode" : "Single Mode"}
            </button>

            {batchMode && batchCount > 0 && (
              <button
                onClick={saveBatchReadings}
                disabled={loading}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 shadow-lg ring-2 ring-emerald-200"
              >
                <Save size={16} />
                {loading ? "Saving..." : `Save ${batchCount} Changes`}
              </button>
            )}

            <button
              onClick={loadMembers}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
              title="Refresh data"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-4 border-b">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab("readings")}
            className={`px-4 py-2 font-semibold text-sm border-b-2 transition-colors ${
              activeTab === "readings"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Meter Readings
          </button>
          <button
            onClick={() => setActiveTab("batches")}
            className={`px-4 py-2 font-semibold text-sm border-b-2 transition-colors ${
              activeTab === "batches"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Batch Management
          </button>
        </div>
      </div>

      {/* Period + Search + Status filter - Only show for readings tab */}
      {activeTab === "readings" && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-1">
              <Calendar size={14} />
              Billing Period
            </label>
            <input
              type="month"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all"
              value={periodKey}
              onChange={(e) => {
                setPeriodKey(e.target.value);
                setPage(1);
              }}
              disabled={loading}
            />
            <div className="mt-1 text-xs text-slate-500 flex items-center gap-1">
              <ArrowLeft size={10} />
              Previous: {previousPeriodKey}
            </div>
          </div>

          <div className="md:col-span-3">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-1">
              <Search size={14} />
              Search Members
            </label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all"
                value={searchInputValue}
                onChange={handleSearchChange}
                placeholder="PN No, Account Name, Meter, Address..."
                disabled={loading}
              />
              {searchInputValue !== searchTerm && (
                <div className="absolute right-3 top-3.5">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-1">
              <FileTextIcon size={14} />
              Status
            </label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              disabled={loading}
            >
              <option value="all">All</option>
              <option value="unread">Unread</option>
              <option value="partial">Partial</option>
              <option value="complete">Complete</option>
            </select>
          </div>
        </div>
      )}

      {/* Stats - Only show for readings tab */}
      {activeTab === "readings" && (
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-slate-200 p-4 bg-white hover:shadow-md transition-shadow">
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <User size={12} />
              Total Members
            </div>
            <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
          </div>
          <div className="rounded-2xl border border-green-200 bg-green-50 p-4 hover:shadow-md transition-shadow">
            <div className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle size={12} />
              Complete (All Meters)
            </div>
            <div className="text-2xl font-bold text-green-700">{stats.read}</div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 hover:shadow-md transition-shadow">
            <div className="text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle size={12} />
              Unread (No Readings)
            </div>
            <div className="text-2xl font-bold text-amber-700">{stats.unread}</div>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 hover:shadow-md transition-shadow">
            <div className="text-xs text-blue-600 flex items-center gap-1">
              <TrendingUp size={12} />
              Partial + Complete
            </div>
            <div className="text-2xl font-bold text-blue-700">{stats.anyRead}</div>
          </div>
        </div>
      )}

      {/* Conditional Content */}
      {activeTab === "readings" ? (
        <>
          {/* Table */}
          <div className="overflow-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">PN No.</th>
                  <th className="py-3 px-4">Account Name</th>
                  <th className="py-3 px-4">Address</th>
                  <th className="py-3 px-4">Meters</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-600">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw size={20} className="animate-spin text-blue-500" />
                        Loading...
                      </div>
                    </td>
                  </tr>
                ) : filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-600">
                      No members found for this period.
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((member) => (
                    <ReadingRow
                      key={member.pnNo}
                      member={member}
                      readings={readings}
                      savedReadings={savedReadings}
                      previousReadings={previousReadings}
                      billsForPeriod={billsForPeriod}
                      expandedMeters={expandedMeters}
                      batchMode={batchMode}
                      editMode={editMode}
                      canEdit={canEdit}
                      validationErrors={validationErrors}
                      editingMeters={editingMeters}
                      periodKey={periodKey}
                      previousPeriodKey={previousPeriodKey}
                      getMemberStatus={getMemberStatus}
                      hasAnyInputForMember={hasAnyInputForMember}
                      hasCompleteInputForMember={hasCompleteInputForMember}
                      isMeterAlreadySaved={isMeterAlreadySaved}
                      getSavedReading={getSavedReading}
                      getPreviousReading={getPreviousReading}
                      isMeterInEditMode={isMeterInEditMode}
                      getMeterBillStatus={getMeterBillStatus}
                      onReadingChange={handleReadingChange}
                      onToggleMeterExpansion={toggleMeterExpansion}
                      onToggleMeterEdit={toggleMeterEdit}
                      onPreview={() => previewSingleBill(member)}
                      onSave={() => saveReading(member)}
                      onViewBill={() => viewBill(member)}
                      onReset={() => resetMemberReadings(member)}
                      onViewHistory={(meter) => viewReadingHistory(member, meter)}
                      onViewBillDetails={viewBillDetails}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex justify-center gap-2">
              <button
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50 hover:bg-slate-50 transition-colors"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum =
                    page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
                  if (pageNum < 1 || pageNum > totalPages) return null;

                  return (
                    <button
                      key={pageNum}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
                        page === pageNum ? "bg-blue-600 text-white shadow-md" : "border border-slate-200 hover:bg-slate-50"
                      } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
                      onClick={() => !loading && setPage(pageNum)}
                      disabled={loading}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50 hover:bg-slate-50 transition-colors"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        /* Batch Management Panel */
        <BatchManagementPanel />
      )}

      {/* Preview Modal */}
      <Modal open={!!preview} title="Bill Preview" onClose={() => setPreview(null)} size="lg">
        {preview && selectedMember && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 p-4 bg-gradient-to-r from-blue-50 to-white">
              <div className="font-bold text-slate-900 text-lg">{preview.accountName}</div>
              <div className="text-sm text-slate-600 mt-1 flex items-center gap-2">
                <span className="bg-slate-100 px-2 py-0.5 rounded font-mono">{preview.pnNo}</span>
                <span>•</span>
                <span className="capitalize">{preview.classification}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  {periodKey}
                </span>
              </div>
            </div>

            {preview.meterReadings?.length > 0 && (
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <FileTextIcon size={16} />
                  Meter Readings
                </div>
                <div className="space-y-3">
                  {preview.meterReadings.map((r, idx) => (
                    <div key={idx} className="p-3 border border-slate-100 rounded-lg bg-slate-50">
                      <div className="grid grid-cols-4 gap-4">
                        <div className="text-center">
                          <div className="text-xs text-slate-500">Meter</div>
                          <div className="text-sm font-bold text-slate-900 font-mono">{r.meterNumber}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-slate-500">Previous</div>
                          <div className="text-sm font-bold text-slate-900">{formatNumber(r.previousReading)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-slate-500">Present</div>
                          <div className="text-sm font-bold text-slate-900">{formatNumber(r.presentReading)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-slate-500">Consumption</div>
                          <div className="text-sm font-bold text-blue-600">
                            {formatNumber(r.presentReading - r.previousReading)} m³
                          </div>
                        </div>
                      </div>
                      {r.consumptionMultiplier > 1 && (
                        <div className="mt-2 text-center text-xs text-slate-600">
                          Multiplier ×{r.consumptionMultiplier} ={' '}
                          {formatNumber((r.presentReading - r.previousReading) * r.consumptionMultiplier)} m³
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-4 text-center p-3 rounded-xl bg-blue-50 border border-blue-100">
                  <div className="text-xs text-blue-600">Total Consumption</div>
                  <div className="text-lg font-bold text-blue-700">
                    {formatNumber(preview.totalConsumption)} m³
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                <DollarSign size={16} />
                Bill Calculation
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">Base Amount:</span>
                  <span className="font-bold">₱{formatNumber(preview.preview?.baseAmount || 0, 2)}</span>
                </div>

                {(preview.preview?.discount || 0) > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span className="flex items-center gap-1">
                      <Percent size={12} />
                      Discount ({preview.preview?.discountReason || "Discount"}):
                    </span>
                    <span className="font-bold">-₱{formatNumber(preview.preview?.discount || 0, 2)}</span>
                  </div>
                )}

                {preview.preview?.tariffUsed && (
                  <div className="text-xs text-slate-500 mt-2 p-2 bg-slate-50 rounded">
                    Applied Tariff: {preview.preview.tariffUsed.tier} @ ₱
                    {formatNumber(preview.preview.tariffUsed.ratePerCubic, 2)}/m³
                  </div>
                )}

                <hr className="border-slate-200 my-2" />

                <div className="flex justify-between text-lg font-bold text-slate-900">
                  <span>Total Amount:</span>
                  <span className="text-blue-600">₱{formatNumber(preview.preview?.amount || 0, 2)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPreview(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 hover:bg-slate-50 transition-colors"
                disabled={loading}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Bill List Modal */}
      <Modal open={billModalOpen} title={`Bills for ${selectedMember?.pnNo || ''}`} onClose={() => setBillModalOpen(false)} size="lg">
        {billsLoading ? (
          <div className="py-10 text-center text-slate-600">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-blue-500" />
            Loading bills...
          </div>
        ) : memberBills.length === 0 ? (
          <div className="py-10 text-center text-slate-600">No bills found for this period.</div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-slate-600 p-3 bg-slate-50 rounded-xl">
              Showing bills for period: <span className="font-bold font-mono">{periodKey}</span>
            </div>
            
            <div className="space-y-3 max-h-96 overflow-auto">
              {memberBills.map((bill) => (
                <div
                  key={bill._id}
                  className="p-4 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition-all hover:shadow-md"
                  onClick={() => viewSpecificBill(bill)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        <FileTextIcon size={14} className="text-blue-500" />
                        Meter: {bill.meterNumber}
                      </div>
                      <div className="text-sm text-slate-600 mt-1">
                        Consumption: {formatNumber(bill.consumed)} m³
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Prev: {formatNumber(bill.previousReading)} → Pres: {formatNumber(bill.presentReading)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg">₱{formatNumber(bill.totalDue || 0, 2)}</div>
                      <div className={`text-xs font-semibold mt-1 px-2 py-1 rounded-full inline-block ${
                        bill.status === 'paid' ? 'bg-green-100 text-green-700' :
                        bill.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {bill.status?.toUpperCase()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Bill Detail Modal */}
      <Modal open={!!selectedBill} title="Bill Details" onClose={() => setSelectedBill(null)} size="lg">
        {selectedBill && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 p-4 bg-gradient-to-r from-blue-50 to-white">
              <div className="font-bold text-slate-900 text-lg">{selectedBill.accountName}</div>
              <div className="text-sm text-slate-600 mt-1 flex flex-wrap gap-2">
                <span className="bg-slate-100 px-2 py-0.5 rounded font-mono">{selectedBill.pnNo}</span>
                <span>•</span>
                <span className="capitalize">{selectedBill.classification}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  {selectedBill.periodCovered}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <FileTextIcon size={10} />
                  Meter Number
                </div>
                <div className="font-bold font-mono">{selectedBill.meterNumber}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <TrendingUp size={10} />
                  Consumption
                </div>
                <div className="font-bold">{formatNumber(selectedBill.consumed)} m³</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Previous Reading</div>
                <div className="font-mono font-bold">{formatNumber(selectedBill.previousReading)}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Present Reading</div>
                <div className="font-mono font-bold">{formatNumber(selectedBill.presentReading)}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">Base Amount:</span>
                  <span className="font-bold">₱{formatNumber(selectedBill.baseAmount || 0, 2)}</span>
                </div>
                {selectedBill.discount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span className="flex items-center gap-1">
                      <Percent size={12} />
                      Discount ({selectedBill.discountReason || "Discount"}):
                    </span>
                    <span className="font-bold">-₱{formatNumber(selectedBill.discount || 0, 2)}</span>
                  </div>
                )}
                {selectedBill.penaltyApplied > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Penalty:</span>
                    <span className="font-bold">+₱{formatNumber(selectedBill.penaltyApplied || 0, 2)}</span>
                  </div>
                )}
                <hr className="border-slate-200 my-2" />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total Due:</span>
                  <span className="text-blue-600">₱{formatNumber(selectedBill.totalDue || 0, 2)}</span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-slate-500">Status:</span>
                  <span className={`font-bold px-2 py-0.5 rounded-full ${
                    selectedBill.status === 'paid' ? 'bg-green-100 text-green-700' : 
                    selectedBill.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {selectedBill.status?.toUpperCase()}
                  </span>
                </div>
                {selectedBill.paidAt && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-slate-500">Paid On:</span>
                    <span className="font-bold">{new Date(selectedBill.paidAt).toLocaleDateString()}</span>
                  </div>
                )}
                {selectedBill.orNo && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-slate-500">OR No:</span>
                    <span className="font-bold font-mono">{selectedBill.orNo}</span>
                  </div>
                )}
              </div>
            </div>

            {selectedBill.tariffUsed && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="text-xs text-blue-600">Tariff Applied</div>
                <div className="font-bold text-blue-800">
                  Tier {selectedBill.tariffUsed.tier}: ₱{formatNumber(selectedBill.tariffUsed.ratePerCubic, 2)}/m³
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Bill Details Modal (from bill status click) */}
      <Modal open={showBillDetails} title="Bill Details" onClose={() => setShowBillDetails(false)} size="lg">
        {selectedBillForView && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 p-4 bg-gradient-to-r from-blue-50 to-white">
              <div className="font-bold text-slate-900 text-lg">{selectedBillForView.accountName}</div>
              <div className="text-sm text-slate-600 mt-1 flex items-center gap-2">
                <span className="font-mono">{selectedBillForView.pnNo}</span>
                <span>•</span>
                <span className="capitalize">{selectedBillForView.classification}</span>
                <span>•</span>
                <span>{selectedBillForView.periodCovered}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Info label="Meter Number" value={selectedBillForView.meterNumber} />
              <Info label="Consumption" value={`${selectedBillForView.consumed?.toFixed(3)} m³`} />
              <Info label="Previous Reading" value={selectedBillForView.previousReading?.toFixed(3)} />
              <Info label="Present Reading" value={selectedBillForView.presentReading?.toFixed(3)} />
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Base Amount:</span>
                  <span className="font-bold">₱{(selectedBillForView.baseAmount || 0).toFixed(2)}</span>
                </div>
                {selectedBillForView.discount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount:</span>
                    <span className="font-bold">-₱{selectedBillForView.discount.toFixed(2)}</span>
                  </div>
                )}
                {selectedBillForView.penaltyApplied > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Penalty:</span>
                    <span className="font-bold">+₱{selectedBillForView.penaltyApplied.toFixed(2)}</span>
                  </div>
                )}
                <hr />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total Due:</span>
                  <span className="text-blue-600">₱{selectedBillForView.totalDue?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Status:</span>
                  <span className={`font-bold ${
                    selectedBillForView.status === 'paid' ? 'text-green-600' : 
                    selectedBillForView.status === 'overdue' ? 'text-red-600' : 'text-amber-600'
                  }`}>
                    {selectedBillForView.status?.toUpperCase()}
                  </span>
                </div>
                {selectedBillForView.orNo && (
                  <div className="flex justify-between text-sm">
                    <span>OR No:</span>
                    <span className="font-mono font-bold">{selectedBillForView.orNo}</span>
                  </div>
                )}
              </div>
            </div>

            {selectedBillForView.tariffUsed && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="text-xs text-blue-600">Tariff Applied</div>
                <div className="font-bold text-blue-800">
                  Tier {selectedBillForView.tariffUsed.tier}: ₱{selectedBillForView.tariffUsed.ratePerCubic?.toFixed(2)}/m³
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Reading History Modal */}
      <Modal open={showHistory} title="Reading History" onClose={() => setShowHistory(false)} size="lg">
        {selectedMemberForHistory && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 p-4 bg-gradient-to-r from-slate-50 to-white">
              <div className="font-bold text-slate-900">
                {selectedMemberForHistory.member.accountName}
              </div>
              <div className="text-sm text-slate-600 mt-1 flex items-center gap-2">
                <span className="font-mono">{selectedMemberForHistory.member.pnNo}</span>
                <span>•</span>
                <span className="font-mono">{selectedMemberForHistory.meter.meterNumber}</span>
              </div>
            </div>

            {selectedMemberForHistory.history.length === 0 ? (
              <div className="py-8 text-center text-slate-600">
                No reading history found for this meter.
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-auto">
                {selectedMemberForHistory.history.map((reading, idx) => (
                  <div key={idx} className="p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                          <Calendar size={10} />
                          Period
                        </div>
                        <div className="font-bold font-mono">{reading.periodKey}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Reading Date</div>
                        <div className="font-bold">{new Date(reading.readAt).toLocaleDateString()}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Read By</div>
                        <div className="font-bold">{reading.readBy || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Previous</div>
                        <div className="font-mono font-bold">{formatNumber(reading.previousReading)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Present</div>
                        <div className="font-mono font-bold">{formatNumber(reading.presentReading)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Consumption</div>
                        <div className="font-mono font-bold text-blue-600">{formatNumber(reading.consumed)} m³</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Result Modal (batch summary) */}
      <Modal open={!!receiptData} title="Batch Result" onClose={() => setReceiptData(null)}>
        {receiptData && (
          <div className="space-y-4">
            <div ref={receiptRef} className="hidden">
              <div className="receipt">
                <div className="header">
                  <h2>BATCH READING RESULT</h2>
                  <p>Period: {periodKey}</p>
                </div>
                <div className="stats">
                  <p className={receiptData.success > 0 ? "success" : ""}>
                    Success: {receiptData.success || 0}
                  </p>
                  <p className={receiptData.failed > 0 ? "error" : ""}>
                    Failed: {receiptData.failed || 0}
                  </p>
                </div>
                {receiptData.details && (
                  <table>
                    <thead>
                      <tr>
                        <th>PN No</th>
                        <th>Status</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receiptData.details.map((d, i) => (
                        <tr key={i}>
                          <td>{d.pnNo}</td>
                          <td className={d.success ? "success" : "error"}>
                            {d.success ? "✓" : "✗"}
                          </td>
                          <td>{d.message || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4 bg-white">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center p-3 bg-green-50 rounded-xl">
                  <div className="text-xs text-green-600">Successful</div>
                  <div className="text-2xl font-bold text-green-700">{receiptData.success || 0}</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-xl">
                  <div className="text-xs text-red-600">Failed</div>
                  <div className="text-2xl font-bold text-red-700">{receiptData.failed || 0}</div>
                </div>
              </div>
              
              {receiptData.details && (
                <div className="mt-4 max-h-60 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="py-2 px-2 text-left">PN No</th>
                        <th className="py-2 px-2 text-center">Status</th>
                        <th className="py-2 px-2 text-left">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receiptData.details.map((d, i) => (
                        <tr key={i} className="border-t">
                          <td className="py-2 px-2 font-mono">{d.pnNo}</td>
                          <td className="py-2 px-2 text-center">
                            {d.success ? (
                              <CheckCircle size={14} className="text-green-600 inline" />
                            ) : (
                              <XCircle size={14} className="text-red-600 inline" />
                            )}
                          </td>
                          <td className="py-2 px-2">{d.message || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReceiptData(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
              <button
                onClick={printReceipt}
                className="flex items-center gap-2 rounded-xl bg-blue-600 text-white px-6 py-2.5 font-semibold hover:bg-blue-700 transition-colors shadow-lg"
              >
                <Printer size={16} />
                Print
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

// ---------- ENHANCED Row Component with Gap Detection and Auto-fill ----------
function ReadingRow({
  member,
  readings,
  savedReadings,
  previousReadings,
  billsForPeriod,
  expandedMeters,
  batchMode,
  editMode,
  canEdit,
  validationErrors,
  editingMeters,
  periodKey,
  previousPeriodKey,
  getMemberStatus,
  hasAnyInputForMember,
  hasCompleteInputForMember,
  isMeterAlreadySaved,
  getSavedReading,
  getPreviousReading,
  isMeterInEditMode,
  getMeterBillStatus,
  onReadingChange,
  onToggleMeterExpansion,
  onToggleMeterEdit,
  onPreview,
  onSave,
  onViewBill,
  onReset,
  onViewHistory,
  onViewBillDetails,
}) {
  const pnKey = safeUpper(member.pnNo || "");
  const isExpanded = !!expandedMeters[pnKey];
  const status = getMemberStatus(member);

  // Determine if member has any bills for this period
  const hasBillsForPeriod = member.activeBillingMeters?.some(m => 
    getMeterBillStatus(member.pnNo, m.meterNumber)
  );

  // Determine if any meter has a bill without a reading (manually created)
  const hasBillWithoutReading = member.activeBillingMeters?.some(m => {
    const bill = getMeterBillStatus(member.pnNo, m.meterNumber);
    return bill && !bill.hasReading;
  });

  const hasPendingChanges = (member.activeBillingMeters || []).some((m) => {
    const mn = safeUpper(m.meterNumber);
    const input = readings[member.pnNo]?.[mn]?.presentReading;
    const saved = getSavedReading(member, m.meterNumber);
    const inEditMode = isMeterInEditMode(member, m.meterNumber);
    const billStatus = getMeterBillStatus(member.pnNo, m.meterNumber);
    
    // If bill is paid and not in edit mode, don't allow changes
    if (billStatus?.status === "paid" && !inEditMode) return false;
    
    if (safeStr(input) === "") return false;
    if (inEditMode) return true;
    if (!saved) return true;
    return saved.presentReading.toString() !== input;
  });

  const statusBadge = (() => {
    if (hasBillsForPeriod) {
      return (
        <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-800 px-2 py-1 text-xs font-bold">
          <DollarSign size={12} className="mr-1" />
          Has Bill
        </span>
      );
    }
    if (status === "complete") {
      return (
        <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-2 py-1 text-xs font-bold">
          <CheckCircle size={12} className="mr-1" />
          Complete
        </span>
      );
    }
    if (status === "partial") {
      return (
        <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-2 py-1 text-xs font-bold">
          Partial
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-1 text-xs font-bold">
        Unread
      </span>
    );
  })();

  return (
    <>
      <tr className={`border-t transition-colors ${
        hasBillsForPeriod ? "bg-purple-50/30" :
        status === "complete" ? "bg-green-50/30" : 
        status === "partial" ? "bg-blue-50/20" : 
        "hover:bg-slate-50/60"
      }`}>
        <td className="py-3 px-4">{statusBadge}</td>

        <td className="py-3 px-4 font-bold text-slate-900 font-mono">{member.pnNo}</td>

        <td className="py-3 px-4">
          <div>
            <div className="font-medium">{member.accountName}</div>
            <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
              <FileTextIcon size={10} />
              {member.billing?.classification || "N/A"}
            </div>
          </div>
        </td>

        <td className="py-3 px-4 text-slate-700 max-w-[200px] truncate" title={member.addressText}>
          <div className="flex items-center gap-1">
            <MapPin size={12} className="text-slate-400 flex-shrink-0" />
            <span className="truncate">{member.addressText || "N/A"}</span>
          </div>
        </td>

        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{member.activeMeters || 0}</span>
            <span className="text-xs text-slate-500">active</span>

            {member.activeMeters > 0 && (
              <button
                onClick={() => onToggleMeterExpansion(member.pnNo)}
                className="ml-2 text-blue-600 hover:text-blue-800 p-1 rounded-lg hover:bg-blue-50 transition-colors"
                title={isExpanded ? "Hide meters" : "Show meters"}
              >
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            )}
          </div>

          {hasBillWithoutReading && (
            <div className="mt-1 text-[11px] text-amber-600 flex items-center gap-1">
              <AlertCircle size={10} />
              Manual bill created (no reading)
            </div>
          )}

          {status === "partial" && (member.missingMeters || []).length > 0 && (
            <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
              <AlertCircle size={10} className="text-amber-500" />
              Missing: {(member.missingMeters || []).slice(0, 3).join(", ")}
              {(member.missingMeters || []).length > 3 ? "…" : ""}
            </div>
          )}
        </td>

        <td className="py-3 px-4 text-right space-x-2">
          <button
            onClick={onPreview}
            disabled={!hasCompleteInputForMember(member) || !canEdit}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 transition-colors"
            title="Preview bill (requires all meters)"
          >
            Preview
          </button>

          {(member.hasReading || member.hasAnyReading || hasBillsForPeriod) && (
            <button
              onClick={onViewBill}
              className="rounded-lg border border-blue-200 text-blue-700 px-3 py-1.5 text-xs font-semibold hover:bg-blue-50 transition-colors"
              title="View bills for this period"
            >
              <Eye size={14} className="inline mr-1" />
              Bills
            </button>
          )}

          {canEdit && hasPendingChanges && (
            <button
              onClick={onSave}
              className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-sm"
              title="Save changes"
            >
              <Save size={14} className="inline mr-1" />
              {batchMode ? "Queue" : "Save"}
            </button>
          )}

          {hasPendingChanges && (
            <button
              onClick={onReset}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 transition-colors"
              title="Clear unsaved changes"
            >
              Reset
            </button>
          )}
        </td>
      </tr>

      {/* EXPANDED METERS with Gap Detection and Auto-fill */}
      {isExpanded && (member.activeBillingMeters || []).length > 0 && (
        <tr className="bg-slate-50/50">
          <td colSpan={6} className="px-4 py-3">
            <div className="pl-4 border-l-2 border-blue-200">
              <div className="text-xs font-semibold text-slate-700 mb-3 flex justify-between items-center">
  <div className="flex items-center gap-4">
    <span className="flex items-center gap-1">
      <FileTextIcon size={12} />
      Meter Readings
    </span>
    <span className="flex items-center gap-1 text-blue-600">
      <ArrowLeft size={10} />
      Previous
    </span>
    <span className="flex items-center gap-1 text-green-600">
      <ArrowRight size={10} />
      Current: {periodKey}
    </span>
  </div>
  {editMode && (
    <span className="text-amber-600 text-[10px] flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-full">
      <PenTool size={10} />
      Edit Mode
    </span>
  )}
</div>

              <div className="space-y-4">
                {(member.activeBillingMeters || []).map((meter, index) => {
                  const pn = member.pnNo;
                  const meterKey = safeUpper(meter.meterNumber);

                  // Get readings from different sources
                  const savedReading = getSavedReading(member, meter.meterNumber);
                  const previousReadingData = getPreviousReading(member, meter.meterNumber);
                  const billStatus = getMeterBillStatus(member.pnNo, meter.meterNumber);
                  
                  // PREVIOUS READING: from the most recent actual reading (with gap detection)
                  const previousReading = previousReadingData?.presentReading ?? 0;
                  
                  // PRESENT READING: current input or saved reading from current period
                  const presentReading = readings[pn]?.[meterKey]?.presentReading ?? savedReading?.presentReading ?? "";
                  
                  const inEditMode = isMeterInEditMode(member, meter.meterNumber);
                  const alreadySaved = isMeterAlreadySaved(member, meter.meterNumber) || !!savedReading;
                  const hasError = validationErrors[`${pn}-${meterKey}`];
                  
                  // Check if current period already has a reading or paid bill
                  const hasCurrentReading = !!savedReading;
                  const isCurrentPaid = billStatus?.status === "paid";
                  
                  // Determine if input should be auto-filled and disabled
                  const isAutoFilled = hasCurrentReading || isCurrentPaid;
                  const isDisabled = (() => {
                    // If in edit mode, never disable
                    if (inEditMode) return false;
                    
                    // If auto-filled (already read or paid), disable
                    if (isAutoFilled) return true;
                    
                    // If bill is paid for CURRENT period, disable
                    if (billStatus?.status === "paid") return true;
                    
                    // Otherwise allow editing
                    return false;
                  })();

                  // Calculate consumption
                  const consumption = presentReading ? 
                    (parseFloat(presentReading) - previousReading) * (meter.consumptionMultiplier || 1) : 0;

                  return (
                    <div 
                      key={meterKey} 
                      className={`p-4 bg-white border rounded-xl transition-all ${
                        billStatus?.status === "paid" 
                          ? "border-green-300 bg-green-50/30 ring-1 ring-green-200" 
                          : inEditMode 
                          ? "border-amber-400 shadow-md bg-amber-50/30 ring-2 ring-amber-100" 
                          : alreadySaved 
                          ? "border-green-200 bg-green-50/30" 
                          : "border-slate-200 hover:border-blue-200"
                      }`}
                    >
                      {/* Header with meter info and bill status */}
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            billStatus?.status === "paid" ? 'bg-green-200' :
                            inEditMode ? 'bg-amber-100' : 
                            alreadySaved ? 'bg-green-100' : 'bg-slate-100'
                          }`}>
                            <span className="font-bold text-sm">{index + 1}</span>
                          </div>
                          <div>
                            <span className="font-mono font-bold text-slate-900">{meter.meterNumber}</span>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {meter.meterBrand} {meter.meterModel} • {meter.meterSize}
                            </div>
                          </div>
                          
                          {/* Bill Status Badge */}
                          {billStatus && (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              billStatus.status === "paid" 
                                ? "bg-green-200 text-green-800" 
                                : billStatus.status === "overdue"
                                ? "bg-red-200 text-red-800"
                                : "bg-amber-200 text-amber-800"
                            }`}>
                              <DollarSign size={8} className="mr-1" />
                              {billStatus.status === "paid" ? "Paid" : billStatus.status}
                            </span>
                          )}
                          
                          {hasCurrentReading && !inEditMode && (
                            <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[10px] font-semibold">
                              <Lock size={10} className="mr-1" />
                              Read
                            </span>
                          )}
                          
                          {inEditMode && (
                            <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-semibold">
                              <Unlock size={10} className="mr-1" />
                              Editing
                            </span>
                          )}
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                          {/* View Bill Button */}
                          {billStatus && (
                            <button
                              onClick={() => onViewBillDetails(member.pnNo, meter.meterNumber)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-semibold hover:bg-purple-200 transition-colors"
                              title="View bill details"
                            >
                              <Eye size={12} />
                              View Bill
                            </button>
                          )}

                          {/* Edit toggle */}
                          {(hasCurrentReading || isCurrentPaid) && editMode && (
                            <button
                              onClick={() => onToggleMeterEdit(member, meter.meterNumber)}
                              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                inEditMode
                                  ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                              title={inEditMode ? "Lock reading" : "Unlock to edit"}
                            >
                              {inEditMode ? <Lock size={12} /> : <Unlock size={12} />}
                              {inEditMode ? "Lock" : "Edit"}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Reading Display Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                        {/* Previous Reading - with gap detection */}
                        <div className="md:col-span-3">
                          <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                            <ArrowLeft size={10} className="text-blue-500" />
                            <span className="font-semibold text-blue-600">Previous Reading</span>
                          </div>
                          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                            <div className="font-mono text-lg font-bold text-blue-700">
                              {formatNumber(previousReading)}
                            </div>
                            {previousReadingData && (
                              <>
                                <div className="text-[9px] text-blue-500 mt-1 flex items-center gap-1">
                                  <Calendar size={8} />
                                  {previousReadingData.source === "immediate_previous" ? (
                                    <>Last month ({previousPeriodKey})</>
                                  ) : previousReadingData.source === "last_reading" ? (
                                    <>Last reading from {previousReadingData.periodKey}</>
                                  ) : previousReadingData.source === "last_paid_bill" ? (
                                    <>Last paid bill from {previousReadingData.periodKey}</>
                                  ) : (
                                    <>From meter record</>
                                  )}
                                </div>
                                {previousReadingData.isGap && (
                                  <div className="text-[9px] text-amber-600 mt-1 flex items-center gap-1">
                                    <AlertCircle size={8} />
                                    Gap detected
                                  </div>
                                )}
                                {previousReadingData.readAt && (
                                  <div className="text-[9px] text-blue-500">
                                    {new Date(previousReadingData.readAt).toLocaleDateString()}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Present Reading Input - with auto-fill */}
                        <div className="md:col-span-4">
                          <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                            <ArrowRight size={10} className="text-green-500" />
                            <span className="font-semibold text-green-600">Present Reading</span>
                            {isAutoFilled && (
                              <span className="text-[9px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded-full ml-1">
                                {isCurrentPaid ? "Paid" : "Read"}
                              </span>
                            )}
                            {!isAutoFilled && !isDisabled && (
                              <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full ml-1">
                                New
                              </span>
                            )}
                          </div>
                          <input
                            type="number"
                            step="0.001"
                            className={`w-full p-3 rounded-lg border font-mono text-lg transition-all ${
                              isDisabled
                                ? "border-slate-200 bg-slate-100 cursor-not-allowed text-slate-600"
                                : hasError
                                ? "border-red-300 bg-red-50"
                                : inEditMode
                                ? "border-amber-300 bg-amber-50 focus:border-amber-500"
                                : "border-slate-200 focus:border-green-300 hover:border-green-200"
                            }`}
                            value={presentReading}
                            onChange={(e) => onReadingChange(pn, meter.meterNumber, e.target.value)}
                            placeholder={isAutoFilled ? "Already recorded" : "Enter reading"}
                            disabled={isDisabled}
                          />
                          {hasError && (
                            <div className="mt-1 text-[10px] text-red-600">{hasError}</div>
                          )}
                          {isAutoFilled && !inEditMode && (
                            <div className="mt-1 text-[10px] text-green-600 flex items-center gap-1">
                              <Lock size={8} />
                              {isCurrentPaid ? "Bill paid - click Edit to modify" : "Reading already recorded for this period"}
                            </div>
                          )}
                          {!isAutoFilled && !isDisabled && (
                            <div className="mt-1 text-[10px] text-blue-600">
                              {billStatus ? "Will update existing bill" : "Will create new bill"}
                            </div>
                          )}
                        </div>

                        {/* Consumption */}
                        <div className="md:col-span-3">
                          <div className="text-xs text-slate-500 mb-1">Consumption</div>
                          <div className={`p-3 rounded-lg border ${
                            consumption > 0 ? 'bg-purple-50 border-purple-200' : 'bg-slate-50 border-slate-200'
                          }`}>
                            <div className="font-mono text-lg font-bold text-purple-600">
                              {formatNumber(consumption)} m³
                            </div>
                            {previousReadingData?.isGap && (
                              <div className="text-[9px] text-amber-600 mt-1">
                                Based on last known reading
                              </div>
                            )}
                          </div>
                        </div>

                        {/* History Button */}
                        <div className="md:col-span-2 flex justify-end">
                          <button
                            onClick={() => onViewHistory(meter)}
                            className="flex items-center gap-1 px-3 py-2 text-blue-600 hover:text-blue-800 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            <History size={16} />
                            <span className="text-xs">History</span>
                          </button>
                        </div>
                      </div>

                      {/* Manual Bill Warning */}
                      {billStatus && !billStatus.hasReading && (
                        <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="text-xs text-amber-700 flex items-center gap-1">
                            <AlertCircle size={12} />
                            Bill created manually - enter reading to link
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-bold text-slate-900 mt-1 break-words">{value ?? "—"}</div>
    </div>
  );
}