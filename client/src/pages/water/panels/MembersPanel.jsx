// Replace your MembersPanel with this updated version

import { useEffect, useMemo, useState } from "react";
import Card from "../../../components/Card";
import Modal from "../../../components/Modal";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";

const PAGE_SIZE = 12;

function formatAddress(a) {
  if (!a) return "";
  const parts = [
    a.houseLotNo,
    a.streetSitioPurok,
    a.barangay,
    a.municipalityCity,
    a.province,
  ].filter(Boolean);
  return parts.join(", ");
}

function Field({ label, children, required = false }) {
  return (
    <div>
      <label className="text-sm font-semibold text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function MembersPanel() {
  const { token } = useAuth();

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [classificationFilter, setClassificationFilter] = useState("");

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [metersModalOpen, setMetersModalOpen] = useState(false); // NEW: Meters management modal

  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [managingMetersFor, setManagingMetersFor] = useState(null); // NEW: For meters management

  const [err, setErr] = useState("");

  const [form, setForm] = useState({
    pnNo: "",
    accountName: "",
    accountType: "individual",
    accountStatus: "active",
    personal: { 
      fullName: "", 
      gender: "other", 
      birthdate: "", 
      dateRegistered: new Date().toISOString().split('T')[0],
      isSeniorCitizen: false,
      seniorId: "",
      seniorDiscountRate: 5,
    },
    address: {
      houseLotNo: "",
      streetSitioPurok: "",
      barangay: "",
      municipalityCity: "",
      province: "",
      coordinates: {
        latitude: null,
        longitude: null,
        accuracy: null
      }
    },
    contact: { 
      mobileNumber: "", 
      email: "", 
      mobileNumber2: "" 
    },
    billing: {
      classification: "residential",
      hasSeniorDiscount: false,
      hasPWD: false,
      pwdId: "",
      pwdDiscountRate: 0,
      discountApplicableTiers: ["31-40", "41+"], // Updated tier names
      billingCycle: "monthly",
      connectionType: "standard",
      meterSize: "5/8",
      waterSource: "main_line",
      usageType: "domestic"
    },
    // NEW: Meters array instead of single meter
    meters: [{
      meterNumber: "",
      meterBrand: "",
      meterModel: "",
      meterSize: "5/8",
      installationDate: new Date().toISOString().split('T')[0],
      meterCondition: "good",
      meterStatus: "active",
      location: {
        description: "",
        placement: "front_yard",
        coordinates: {
          latitude: null,
          longitude: null,
          accuracy: null
        },
        accessNotes: "",
        visibility: "good",
        safetyNotes: ""
      },
      serialNumber: "",
      initialReading: 0,
      isBillingActive: true,
      billingSequence: 0
    }]
  });

  // NEW: Meters management form
  const [metersForm, setMetersForm] = useState([]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total]
  );

  async function load() {
    setLoading(true);
    setErr("");
    try {
      let url = `/water/members?q=${encodeURIComponent(q)}&page=${page}&limit=${PAGE_SIZE}`;
      if (classificationFilter) {
        url += `&classification=${encodeURIComponent(classificationFilter)}`;
      }
      
      const data = await apiFetch(url, { token });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, page, classificationFilter]);

  function openAdd() {
    setEditing(null);
    setErr("");
    setForm({
      pnNo: "",
      accountName: "",
      accountType: "individual",
      accountStatus: "active",
      personal: { 
        fullName: "", 
        gender: "other", 
        birthdate: "", 
        dateRegistered: new Date().toISOString().split('T')[0],
        isSeniorCitizen: false,
        seniorId: "",
        seniorDiscountRate: 5,
      },
      address: {
        houseLotNo: "",
        streetSitioPurok: "",
        barangay: "",
        municipalityCity: "",
        province: "",
        coordinates: {
          latitude: null,
          longitude: null,
          accuracy: null
        }
      },
      contact: { mobileNumber: "", email: "", mobileNumber2: "" },
      billing: {
        classification: "residential",
        hasSeniorDiscount: false,
        hasPWD: false,
        pwdId: "",
        pwdDiscountRate: 0,
        discountApplicableTiers: ["31-40", "41+"],
        billingCycle: "monthly",
        connectionType: "standard",
        meterSize: "5/8",
        waterSource: "main_line",
        usageType: "domestic"
      },
      meters: [{
        meterNumber: "",
        meterBrand: "",
        meterModel: "",
        meterSize: "5/8",
        installationDate: new Date().toISOString().split('T')[0],
        meterCondition: "good",
        meterStatus: "active",
        location: {
          description: "",
          placement: "front_yard",
          coordinates: {
            latitude: null,
            longitude: null,
            accuracy: null
          },
          accessNotes: "",
          visibility: "good",
          safetyNotes: ""
        },
        serialNumber: "",
        initialReading: 0,
        isBillingActive: true,
        billingSequence: 0
      }]
    });
    setModalOpen(true);
  }

  function openEdit(m) {
    setEditing(m);
    setErr("");
    setForm({
      pnNo: m.pnNo || "",
      accountName: m.accountName || "",
      accountType: m.accountType || "individual",
      accountStatus: m.accountStatus || "active",
      personal: {
        fullName: m.personal?.fullName || "",
        gender: m.personal?.gender || "other",
        birthdate: m.personal?.birthdate ? String(m.personal.birthdate).slice(0, 10) : "",
        dateRegistered: m.personal?.dateRegistered
          ? new Date(m.personal.dateRegistered).toISOString().slice(0, 10)
          : new Date().toISOString().split('T')[0],
        isSeniorCitizen: m.personal?.isSeniorCitizen || false,
        seniorId: m.personal?.seniorId || "",
        seniorDiscountRate: m.personal?.seniorDiscountRate || 5,
      },
      address: {
        houseLotNo: m.address?.houseLotNo || "",
        streetSitioPurok: m.address?.streetSitioPurok || "",
        barangay: m.address?.barangay || "",
        municipalityCity: m.address?.municipalityCity || "",
        province: m.address?.province || "",
        coordinates: m.address?.coordinates || {
          latitude: null,
          longitude: null,
          accuracy: null
        }
      },
      contact: {
        mobileNumber: m.contact?.mobileNumber || "",
        email: m.contact?.email || "",
        mobileNumber2: m.contact?.mobileNumber2 || "",
      },
      billing: {
        classification: m.billing?.classification || "residential",
        hasSeniorDiscount: m.billing?.hasSeniorDiscount || false,
        hasPWD: m.billing?.hasPWD || false,
        pwdId: m.billing?.pwdId || "",
        pwdDiscountRate: m.billing?.pwdDiscountRate || 0,
        discountApplicableTiers: m.billing?.discountApplicableTiers || ["31-40", "41+"],
        billingCycle: m.billing?.billingCycle || "monthly",
        connectionType: m.billing?.connectionType || "standard",
        meterSize: m.billing?.meterSize || "5/8",
        waterSource: m.billing?.waterSource || "main_line",
        usageType: m.billing?.usageType || "domestic"
      },
      // UPDATED: Use meters array
      meters: m.meters?.length > 0 ? m.meters.map(meter => ({
        ...meter,
        installationDate: meter.installationDate ? new Date(meter.installationDate).toISOString().slice(0, 10) : "",
        lastCalibration: meter.lastCalibration ? new Date(meter.lastCalibration).toISOString().slice(0, 10) : "",
        nextCalibration: meter.nextCalibration ? new Date(meter.nextCalibration).toISOString().slice(0, 10) : "",
        lastMaintenance: meter.lastMaintenance ? new Date(meter.lastMaintenance).toISOString().slice(0, 10) : "",
        location: {
          ...meter.location,
          coordinates: meter.location?.coordinates || {
            latitude: null,
            longitude: null,
            accuracy: null
          }
        }
      })) : [{
        meterNumber: "",
        meterBrand: "",
        meterModel: "",
        meterSize: "5/8",
        installationDate: new Date().toISOString().split('T')[0],
        meterCondition: "good",
        meterStatus: "active",
        location: {
          description: "",
          placement: "front_yard",
          coordinates: {
            latitude: null,
            longitude: null,
            accuracy: null
          },
          accessNotes: "",
          visibility: "good",
          safetyNotes: ""
        },
        serialNumber: "",
        initialReading: 0,
        isBillingActive: true,
        billingSequence: 0
      }]
    });
    setModalOpen(true);
  }

  function openView(m) {
    setViewing(m);
    setViewOpen(true);
  }

  // NEW: Open meters management modal
  function openManageMeters(m) {
    setManagingMetersFor(m);
    setMetersForm(m.meters?.map(meter => ({
      ...meter,
      installationDate: meter.installationDate ? new Date(meter.installationDate).toISOString().slice(0, 10) : "",
      lastCalibration: meter.lastCalibration ? new Date(meter.lastCalibration).toISOString().slice(0, 10) : "",
      nextCalibration: meter.nextCalibration ? new Date(meter.nextCalibration).toISOString().slice(0, 10) : "",
      lastMaintenance: meter.lastMaintenance ? new Date(meter.lastMaintenance).toISOString().slice(0, 10) : "",
    })) || []);
    setMetersModalOpen(true);
  }

  // NEW: Add a new meter to the form
  function addMeterToForm() {
    setForm({
      ...form,
      meters: [
        ...form.meters,
        {
          meterNumber: "",
          meterBrand: "",
          meterModel: "",
          meterSize: "5/8",
          installationDate: new Date().toISOString().split('T')[0],
          meterCondition: "good",
          meterStatus: "active",
          location: {
            description: "",
            placement: "front_yard",
            coordinates: {
              latitude: null,
              longitude: null,
              accuracy: null
            },
            accessNotes: "",
            visibility: "good",
            safetyNotes: ""
          },
          serialNumber: "",
          initialReading: 0,
          isBillingActive: true,
          billingSequence: form.meters.length
        }
      ]
    });
  }

  // NEW: Remove a meter from the form
  function removeMeterFromForm(index) {
    if (form.meters.length <= 1) {
      alert("Account must have at least one meter");
      return;
    }
    const newMeters = [...form.meters];
    newMeters.splice(index, 1);
    // Update billing sequence
    newMeters.forEach((meter, idx) => {
      meter.billingSequence = idx;
    });
    setForm({ ...form, meters: newMeters });
  }

  // NEW: Update a meter in the form
  function updateMeterInForm(index, field, value) {
    const newMeters = [...form.meters];
    
    if (field.includes('.')) {
      // Handle nested fields (e.g., location.description)
      const [parent, child] = field.split('.');
      if (parent === 'location' && child.includes('.')) {
        // Handle location.coordinates.latitude
        const [locChild, coordField] = child.split('.');
        newMeters[index][parent][locChild][coordField] = value;
      } else {
        newMeters[index][parent][child] = value;
      }
    } else {
      newMeters[index][field] = value;
    }
    
    setForm({ ...form, meters: newMeters });
  }

  async function save() {
  setErr("");

  // Basic validation
  const requiredFields = [
    { field: form.pnNo.trim(), message: "PN No. is required." },
    { field: form.accountName.trim(), message: "Account Name is required." },
    { field: form.contact.mobileNumber.trim(), message: "Mobile Number is required." },
    { field: form.personal.fullName.trim(), message: "Full Name of Account Holder is required." },
    { field: form.personal.birthdate.trim(), message: "Birthdate is required." },
  ];

  // Validate at least one meter with meter number
  const hasValidMeter = form.meters.some(m => m.meterNumber.trim() !== "");
  if (!hasValidMeter) {
    setErr("At least one meter with a meter number is required.");
    return;
  }

  for (const { field, message } of requiredFields) {
    if (!field) {
      setErr(message);
      return;
    }
  }

  try {
    const payload = {
      ...form,
      pnNo: form.pnNo.trim().toUpperCase(),
      accountName: form.accountName.trim(),
      contact: {
        ...form.contact,
        mobileNumber: form.contact.mobileNumber.trim(),
        email: (form.contact.email || "").trim(),
        mobileNumber2: (form.contact.mobileNumber2 || "").trim(),
      },
      personal: {
        ...form.personal,
        fullName: form.personal.fullName.trim(),
        birthdate: form.personal.birthdate,
        dateRegistered: form.personal.dateRegistered || new Date().toISOString().split('T')[0],
        seniorId: form.personal.seniorId?.trim() || "",
        isSeniorCitizen: form.personal.isSeniorCitizen,
        seniorDiscountRate: parseFloat(form.personal.seniorDiscountRate) || 5,
      },
      // FIXED: Clean coordinates before sending
      address: {
        ...form.address,
        houseLotNo: (form.address.houseLotNo || "").trim(),
        streetSitioPurok: (form.address.streetSitioPurok || "").trim(),
        barangay: (form.address.barangay || "").trim(),
        municipalityCity: (form.address.municipalityCity || "").trim(),
        province: (form.address.province || "").trim(),
        // Only include coordinates if both lat and long are valid
        coordinates: (form.address.coordinates?.latitude && form.address.coordinates?.longitude)
          ? form.address.coordinates
          : undefined
      },
      billing: {
        ...form.billing,
        classification: form.billing.classification || "residential",
        hasSeniorDiscount: form.personal.isSeniorCitizen,
        hasPWD: form.billing.hasPWD,
        pwdId: form.billing.pwdId?.trim() || "",
        pwdDiscountRate: parseFloat(form.billing.pwdDiscountRate) || 0,
        discountApplicableTiers: Array.isArray(form.billing.discountApplicableTiers) 
          ? form.billing.discountApplicableTiers 
          : ["31-40", "41+"],
        billingCycle: form.billing.billingCycle || "monthly",
        connectionType: form.billing.connectionType || "standard",
        meterSize: form.billing.meterSize || "5/8",
        waterSource: form.billing.waterSource || "main_line",
        usageType: form.billing.usageType || "domestic"
      },
      // FIXED: Clean meter coordinates before sending
      meters: form.meters.map((meter, index) => {
        const cleanedMeter = {
          ...meter,
          meterNumber: meter.meterNumber.trim().toUpperCase(),
          meterBrand: (meter.meterBrand || "").trim(),
          meterModel: (meter.meterModel || "").trim(),
          installationDate: meter.installationDate,
          meterCondition: meter.meterCondition || "good",
          meterStatus: meter.meterStatus || "active",
          location: {
            description: (meter.location?.description || "").trim(),
            placement: meter.location?.placement || "front_yard",
            // Only include coordinates if both lat and long are valid
            coordinates: (meter.location?.coordinates?.latitude && meter.location?.coordinates?.longitude)
              ? meter.location.coordinates
              : undefined,
            accessNotes: (meter.location?.accessNotes || "").trim(),
            visibility: meter.location?.visibility || "good",
            safetyNotes: (meter.location?.safetyNotes || "").trim()
          },
          serialNumber: (meter.serialNumber || "").trim(),
          initialReading: parseFloat(meter.initialReading) || 0,
          isBillingActive: meter.isBillingActive !== false,
          billingSequence: index
        };
        
        return cleanedMeter;
      })
    };

    console.log("Sending payload:", JSON.stringify(payload, null, 2));

    if (!editing) {
      const response = await apiFetch("/water/members", { 
        method: "POST", 
        token, 
        body: payload 
      });
      setToast("✅ Member added successfully");
    } else {
      const response = await apiFetch(`/water/members/${editing._id}`, {
        method: "PUT",
        token,
        body: payload,
      });
      setToast("✅ Member updated successfully");
    }

    setModalOpen(false);
    await load();
    setTimeout(() => setToast(""), 2000);
  } catch (e) {
    console.error("Save error:", e);
    
    if (e.message.includes("duplicate key") || e.message.includes("already exists")) {
      setErr("PN Number already exists. Please use a unique PN Number.");
    } else if (e.message.includes("ValidationError")) {
      setErr("Validation failed. Please check all required fields.");
    } else if (e.message.includes("geo keys")) {
      setErr("Location coordinates error. Please check GPS coordinates.");
    } else {
      setErr(e.message || "Failed to save member. Please try again.");
    }
  }
}

  async function removeMember(m) {
    const ok = confirm(`Delete member PN No. ${m.pnNo}?`);
    if (!ok) return;

    try {
      await apiFetch(`/water/members/${m._id}`, { method: "DELETE", token });
      setToast("🗑️ Member deleted");
      await load();
      setTimeout(() => setToast(""), 2000);
    } catch (e) {
      alert(e.message);
    }
  }

  function onSearchChange(v) {
    setPage(1);
    setQ(v);
  }

  // NEW: Get primary meter number for display
  function getPrimaryMeterNumber(member) {
    if (!member.meters || member.meters.length === 0) return "—";
    const primaryMeter = member.meters.find(m => 
      m.meterStatus === "active" && m.isBillingActive === true
    ) || member.meters[0];
    return primaryMeter.meterNumber;
  }

  // NEW: Get meter count for display
  function getMeterCount(member) {
    if (!member.meters) return 0;
    return member.meters.length;
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-lg font-black text-slate-900">Members</div>
          <div className="text-xs text-slate-600 mt-1">
            Register households/clients. PN No. is unique and used as the account number.
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={q}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search PN No / Account Name"
            className="w-full sm:w-80 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
          
          <select
            value={classificationFilter}
            onChange={(e) => {
              setPage(1);
              setClassificationFilter(e.target.value);
            }}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="">All Classifications</option>
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
            <option value="institutional">Institutional</option>
            <option value="government">Government</option>
          </select>
          
          <button
            onClick={openAdd}
            className="rounded-2xl bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700"
          >
            + Add Member
          </button>
        </div>
      </div>

      {toast && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {toast}
        </div>
      )}

      {err && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {err}
        </div>
      )}

      <div className="mt-4 overflow-auto rounded-2xl border border-slate-100 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="py-3 px-4">PN No.</th>
              <th className="py-3 px-4">Account Name</th>
              <th className="py-3 px-4">Address</th>
              <th className="py-3 px-4">Class</th>
              <th className="py-3 px-4">Meters</th>
              <th className="py-3 px-4">Senior</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-600">
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-600">
                  No members found.
                </td>
              </tr>
            ) : (
              items.map((m) => (
                <tr key={m._id} className="border-t hover:bg-slate-50/60">
                  <td className="py-3 px-4 font-bold text-slate-900">{m.pnNo}</td>
                  <td className="py-3 px-4">{m.accountName}</td>
                  <td className="py-3 px-4 text-slate-700 max-w-[300px] truncate">
                    {formatAddress(m.address)}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-bold ${
                      m.billing?.classification === "residential" 
                        ? "bg-blue-100 text-blue-800" 
                        : m.billing?.classification === "commercial"
                        ? "bg-purple-100 text-purple-800"
                        : "bg-slate-100 text-slate-800"
                    }`}>
                      {m.billing?.classification || "residential"}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col">
                      <span className="font-semibold">{getPrimaryMeterNumber(m)}</span>
                      <span className="text-xs text-slate-500">
                        {getMeterCount(m)} meter{getMeterCount(m) !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {m.personal?.isSeniorCitizen ? (
                      <span className="inline-flex items-center rounded-full bg-yellow-100 text-yellow-800 px-2 py-1 text-xs font-bold">
                        Senior
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${
                      m.accountStatus === "active" 
                        ? "bg-green-100 border-green-200 text-green-800" 
                        : m.accountStatus === "inactive"
                        ? "bg-amber-100 border-amber-200 text-amber-800"
                        : "bg-red-100 border-red-200 text-red-800"
                    }`}>
                      {m.accountStatus}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                      onClick={() => openView(m)}
                    >
                      View
                    </button>
                    <button
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                      onClick={() => openEdit(m)}
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                      onClick={() => openManageMeters(m)}
                      title="Manage Meters"
                    >
                      Meters
                    </button>
                    <button
                      className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                      onClick={() => removeMember(m)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-600">
          Showing <b>{items.length}</b> of <b>{total}</b> members
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>

          <div className="text-sm font-semibold text-slate-700">
            Page {page} / {totalPages}
          </div>

          <button
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </div>

      {/* View Modal - Updated for multiple meters */}
      <Modal open={viewOpen} title="Member Details" onClose={() => setViewOpen(false)} size="lg">
        {viewing && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Info label="PN No." value={viewing.pnNo} />
              <Info label="Account Name" value={viewing.accountName} />
              <Info label="Classification" value={viewing.billing?.classification || "residential"} />
              <Info label="Account Status" value={viewing.accountStatus} />
              <Info label="Primary Meter" value={getPrimaryMeterNumber(viewing)} />
              <Info label="Total Meters" value={getMeterCount(viewing)} />
              <Info label="Mobile Number" value={viewing.contact?.mobileNumber} />
              <Info label="Email" value={viewing.contact?.email || "—"} />
              <Info label="Date Registered" value={viewing.personal?.dateRegistered ? new Date(viewing.personal.dateRegistered).toLocaleDateString() : "—"} />
              
              {/* Senior Citizen Info */}
              {viewing.personal?.isSeniorCitizen && (
                <>
                  <Info label="Senior Citizen" value="Yes" />
                  <Info label="Senior ID" value={viewing.personal?.seniorId || "—"} />
                  <Info label="Discount Rate" value={`${viewing.personal?.seniorDiscountRate || 5}%`} />
                  <Info label="Applicable Tiers" value={viewing.billing?.discountApplicableTiers?.join(", ") || "31-40, 41+"} />
                </>
              )}
              
              {/* PWD Info */}
              {viewing.billing?.hasPWD && (
                <>
                  <Info label="PWD" value="Yes" />
                  <Info label="PWD ID" value={viewing.billing?.pwdId || "—"} />
                  <Info label="PWD Discount Rate" value={`${viewing.billing?.pwdDiscountRate || 0}%`} />
                </>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="font-bold text-slate-900">Address</div>
              <div className="text-sm text-slate-700 mt-2">{formatAddress(viewing.address) || "—"}</div>
            </div>
            
            {/* Meters Information */}
            {viewing.meters && viewing.meters.length > 0 && (
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="font-bold text-slate-900 mb-3">Meter Information</div>
                <div className="space-y-3">
                  {viewing.meters.map((meter, index) => (
                    <div key={index} className="p-3 border border-slate-100 rounded-lg bg-slate-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold text-slate-900">{meter.meterNumber}</div>
                          <div className="text-xs text-slate-600 mt-1">
                            {meter.meterBrand} {meter.meterModel} • {meter.meterSize}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            Status: <span className={`font-semibold ${
                              meter.meterStatus === "active" ? "text-green-600" : "text-amber-600"
                            }`}>{meter.meterStatus}</span> • 
                            Condition: <span className="font-semibold">{meter.meterCondition}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          {meter.isBillingActive && (
                            <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-2 py-1 text-xs font-bold">
                              Billing Active
                            </span>
                          )}
                        </div>
                      </div>
                      {meter.location?.description && (
                        <div className="mt-2 text-xs text-slate-600">
                          Location: {meter.location.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="font-bold text-slate-900">Billing Information</div>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <Info label="Billing Cycle" value={viewing.billing?.billingCycle || "monthly"} />
                <Info label="Connection Type" value={viewing.billing?.connectionType || "standard"} />
                <Info label="Meter Size" value={viewing.billing?.meterSize || "5/8"} />
                <Info label="Water Source" value={viewing.billing?.waterSource || "main_line"} />
                <Info label="Usage Type" value={viewing.billing?.usageType || "domestic"} />
                <Info label="Age" value={viewing.age ? `${viewing.age} years` : "—"} />
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Add/Edit Modal - Updated for multiple meters */}
      <Modal open={modalOpen} title={editing ? "Edit Member" : "Add Member"} onClose={() => setModalOpen(false)} size="lg">
        <div className="space-y-5 max-h-[80vh] overflow-y-auto pr-2">
          {/* Account Details Section */}
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="font-bold text-slate-900 mb-3">Account Details</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="PN No. (Account Number)" required>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.pnNo}
                  onChange={(e) => setForm({ ...form, pnNo: e.target.value })}
                  disabled={!!editing}
                  placeholder="PN-001"
                />
              </Field>

              <Field label="Account Name" required>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.accountName}
                  onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                  placeholder="e.g., Juan Dela Cruz"
                />
              </Field>

              <Field label="Account Type">
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.accountType}
                  onChange={(e) => setForm({ ...form, accountType: e.target.value })}
                >
                  <option value="individual">Individual</option>
                  <option value="business">Business</option>
                  <option value="government">Government</option>
                  <option value="institution">Institution</option>
                </select>
              </Field>

              <Field label="Account Status">
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.accountStatus}
                  onChange={(e) => setForm({ ...form, accountStatus: e.target.value })}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="disconnected">Disconnected</option>
                  <option value="suspended">Suspended</option>
                  <option value="pending">Pending</option>
                </select>
              </Field>
            </div>
          </div>

          {/* Personal Information Section */}
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="font-bold text-slate-900 mb-3">Personal / Household Details</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Full Name of Account Holder" required>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.personal.fullName}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      personal: { ...form.personal, fullName: e.target.value },
                    })
                  }
                  placeholder="Full legal name"
                />
              </Field>

              <Field label="Birthdate" required>
                <input
                  type="date"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.personal.birthdate}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      personal: { ...form.personal, birthdate: e.target.value },
                    })
                  }
                />
              </Field>

              <Field label="Gender">
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.personal.gender}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      personal: { ...form.personal, gender: e.target.value },
                    })
                  }
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </Field>

              <Field label="Date Registered">
                <input
                  type="date"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.personal.dateRegistered}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      personal: { ...form.personal, dateRegistered: e.target.value },
                    })
                  }
                />
              </Field>
            </div>
          </div>

          {/* Senior Citizen & Discounts Section */}
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="font-bold text-slate-900 mb-3">Senior Citizen & Discounts</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isSeniorCitizen"
                  checked={form.personal.isSeniorCitizen}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      personal: { ...form.personal, isSeniorCitizen: e.target.checked },
                      billing: { ...form.billing, hasSeniorDiscount: e.target.checked }
                    })
                  }
                  className="rounded border-slate-300"
                />
                <label htmlFor="isSeniorCitizen" className="text-sm font-medium text-slate-700">
                  Senior Citizen
                </label>
              </div>

              {form.personal.isSeniorCitizen && (
                <>
                  <Field label="Senior Citizen ID">
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                      value={form.personal.seniorId}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          personal: { ...form.personal, seniorId: e.target.value },
                        })
                      }
                      placeholder="Senior ID Number"
                    />
                  </Field>

                  <Field label="Discount Rate (%)">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                      value={form.personal.seniorDiscountRate}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          personal: { ...form.personal, seniorDiscountRate: parseFloat(e.target.value) || 5 },
                        })
                      }
                    />
                  </Field>

                  <div className="md:col-span-2">
                    <Field label="Discount Applicable Tiers">
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                        value={form.billing.discountApplicableTiers.join(", ")}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            billing: { 
                              ...form.billing, 
                              discountApplicableTiers: e.target.value.split(",").map(t => t.trim()).filter(t => t)
                            },
                          })
                        }
                        placeholder="31-40, 41+"
                      />
                      <div className="text-xs text-slate-500 mt-1">
                        Senior discount only applies to these consumption tiers (comma-separated)
                      </div>
                    </Field>
                  </div>
                </>
              )}

              <div className="md:col-span-2 mt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="hasPWD"
                    checked={form.billing.hasPWD}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        billing: { ...form.billing, hasPWD: e.target.checked },
                      })
                    }
                    className="rounded border-slate-300"
                  />
                  <label htmlFor="hasPWD" className="text-sm font-medium text-slate-700">
                    Person with Disability (PWD)
                  </label>
                </div>
                
                {form.billing.hasPWD && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="PWD ID">
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                        value={form.billing.pwdId}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            billing: { ...form.billing, pwdId: e.target.value },
                          })
                        }
                        placeholder="PWD ID Number"
                      />
                    </Field>
                    
                    <Field label="PWD Discount Rate (%)">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                        value={form.billing.pwdDiscountRate}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            billing: { ...form.billing, pwdDiscountRate: parseFloat(e.target.value) || 0 },
                          })
                        }
                      />
                    </Field>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Address Information Section */}
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="font-bold text-slate-900 mb-3">Address Information</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="House No. / Lot No.">
                <input 
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.address.houseLotNo}
                  onChange={(e)=>setForm({...form,address:{...form.address,houseLotNo:e.target.value}})}
                  placeholder="123"
                />
              </Field>
              <Field label="Street / Sitio / Purok">
                <input 
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.address.streetSitioPurok}
                  onChange={(e)=>setForm({...form,address:{...form.address,streetSitioPurok:e.target.value}})}
                  placeholder="Main Street"
                />
              </Field>
              <Field label="Barangay">
                <input 
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.address.barangay}
                  onChange={(e)=>setForm({...form,address:{...form.address,barangay:e.target.value}})}
                  placeholder="Barangay 1"
                />
              </Field>
              <Field label="Municipality / City">
                <input 
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.address.municipalityCity}
                  onChange={(e)=>setForm({...form,address:{...form.address,municipalityCity:e.target.value}})}
                  placeholder="Manila"
                />
              </Field>
              <Field label="Province">
                <input 
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.address.province}
                  onChange={(e)=>setForm({...form,address:{...form.address,province:e.target.value}})}
                  placeholder="Metro Manila"
                />
              </Field>
            </div>
          </div>

          {/* Contact Information Section */}
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="font-bold text-slate-900 mb-3">Contact Information</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Mobile Number" required>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.contact.mobileNumber}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      contact: { ...form.contact, mobileNumber: e.target.value },
                    })
                  }
                  placeholder="09123456789"
                />
              </Field>
              <Field label="Secondary Mobile Number (optional)">
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.contact.mobileNumber2}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      contact: { ...form.contact, mobileNumber2: e.target.value },
                    })
                  }
                  placeholder="09123456789"
                />
              </Field>
              <Field label="Email Address (optional)">
                <input
                  type="email"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.contact.email}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      contact: { ...form.contact, email: e.target.value },
                    })
                  }
                  placeholder="email@example.com"
                />
              </Field>
            </div>
          </div>

          {/* Billing Settings Section */}
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="font-bold text-slate-900 mb-3">Billing Settings</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Classification" required>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.billing.classification}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      billing: { ...form.billing, classification: e.target.value },
                    })
                  }
                >
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="institutional">Institutional</option>
                  <option value="government">Government</option>
                </select>
              </Field>

              <Field label="Billing Cycle">
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.billing.billingCycle}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      billing: { ...form.billing, billingCycle: e.target.value },
                    })
                  }
                >
                  <option value="monthly">Monthly</option>
                  <option value="bi-monthly">Bi-monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </Field>

              <Field label="Connection Type">
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.billing.connectionType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      billing: { ...form.billing, connectionType: e.target.value },
                    })
                  }
                >
                  <option value="standard">Standard</option>
                  <option value="industrial">Industrial</option>
                  <option value="temporary">Temporary</option>
                  <option value="fire_service">Fire Service</option>
                </select>
              </Field>

              <Field label="Water Source">
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.billing.waterSource}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      billing: { ...form.billing, waterSource: e.target.value },
                    })
                  }
                >
                  <option value="main_line">Main Line</option>
                  <option value="deep_well">Deep Well</option>
                  <option value="spring">Spring</option>
                  <option value="other">Other</option>
                </select>
              </Field>

              <Field label="Usage Type">
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.billing.usageType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      billing: { ...form.billing, usageType: e.target.value },
                    })
                  }
                >
                  <option value="domestic">Domestic</option>
                  <option value="commercial">Commercial</option>
                  <option value="industrial">Industrial</option>
                  <option value="institutional">Institutional</option>
                  <option value="mixed">Mixed</option>
                </select>
              </Field>
            </div>
          </div>

          {/* Meters Section - NEW */}
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="font-bold text-slate-900">Meters</div>
              <button
                type="button"
                onClick={addMeterToForm}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100"
              >
                + Add Meter
              </button>
            </div>
            
            <div className="space-y-4">
              {form.meters.map((meter, index) => (
                <div key={index} className="p-4 border border-slate-200 rounded-xl bg-slate-50">
                  <div className="flex justify-between items-center mb-3">
                    <div className="font-bold text-slate-900">
                      Meter #{index + 1} {meter.isBillingActive && "(Billing Active)"}
                    </div>
                    {form.meters.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMeterFromForm(index)}
                        className="rounded-xl border border-red-200 bg-red-50 px-3 py-1 text-sm font-bold text-red-700 hover:bg-red-100"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Meter Number" required>
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                        value={meter.meterNumber}
                        onChange={(e) => updateMeterInForm(index, 'meterNumber', e.target.value)}
                        placeholder="e.g., MET-001"
                      />
                    </Field>

                    <Field label="Meter Brand">
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                        value={meter.meterBrand}
                        onChange={(e) => updateMeterInForm(index, 'meterBrand', e.target.value)}
                        placeholder="e.g., Neptune"
                      />
                    </Field>

                    <Field label="Meter Model">
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                        value={meter.meterModel}
                        onChange={(e) => updateMeterInForm(index, 'meterModel', e.target.value)}
                        placeholder="e.g., T-10"
                      />
                    </Field>

                    <Field label="Meter Size">
                      <select
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                        value={meter.meterSize}
                        onChange={(e) => updateMeterInForm(index, 'meterSize', e.target.value)}
                      >
                        <option value="5/8">5/8"</option>
                        <option value="3/4">3/4"</option>
                        <option value="1">1"</option>
                        <option value="1.5">1.5"</option>
                        <option value="2">2"</option>
                        <option value="3">3"</option>
                        <option value="4">4"</option>
                        <option value="6">6"</option>
                        <option value="8">8"</option>
                        <option value="10">10"</option>
                        <option value="12">12"</option>
                      </select>
                    </Field>

                    <Field label="Serial Number">
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                        value={meter.serialNumber}
                        onChange={(e) => updateMeterInForm(index, 'serialNumber', e.target.value)}
                        placeholder="e.g., SN123456"
                      />
                    </Field>

                    <Field label="Initial Reading">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                        value={meter.initialReading}
                        onChange={(e) => updateMeterInForm(index, 'initialReading', e.target.value)}
                        placeholder="0"
                      />
                    </Field>

                    <Field label="Installation Date">
                      <input
                        type="date"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                        value={meter.installationDate}
                        onChange={(e) => updateMeterInForm(index, 'installationDate', e.target.value)}
                      />
                    </Field>

                    <Field label="Meter Condition">
                      <select
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                        value={meter.meterCondition}
                        onChange={(e) => updateMeterInForm(index, 'meterCondition', e.target.value)}
                      >
                        <option value="good">Good</option>
                        <option value="needs_repair">Needs Repair</option>
                        <option value="replaced">Replaced</option>
                        <option value="defective">Defective</option>
                        <option value="tampered">Tampered</option>
                        <option value="locked">Locked</option>
                      </select>
                    </Field>

                    <Field label="Meter Status">
                      <select
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                        value={meter.meterStatus}
                        onChange={(e) => updateMeterInForm(index, 'meterStatus', e.target.value)}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="removed">Removed</option>
                        <option value="under_maintenance">Under Maintenance</option>
                      </select>
                    </Field>

                    {/* Location Information */}
                    <div className="md:col-span-2">
                      <div className="font-bold text-slate-900 mb-2">Location Information</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label="Location Description">
                          <input
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                            value={meter.location?.description || ""}
                            onChange={(e) => updateMeterInForm(index, 'location.description', e.target.value)}
                            placeholder="e.g., Front yard near gate"
                          />
                        </Field>

                        <Field label="Placement">
                          <select
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                            value={meter.location?.placement || "front_yard"}
                            onChange={(e) => updateMeterInForm(index, 'location.placement', e.target.value)}
                          >
                            <option value="front_yard">Front Yard</option>
                            <option value="backyard">Backyard</option>
                            <option value="side_yard">Side Yard</option>
                            <option value="garage">Garage</option>
                            <option value="basement">Basement</option>
                            <option value="sidewalk">Sidewalk</option>
                            <option value="street">Street</option>
                            <option value="other">Other</option>
                          </select>
                        </Field>

                        <Field label="Access Notes">
                          <input
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                            value={meter.location?.accessNotes || ""}
                            onChange={(e) => updateMeterInForm(index, 'location.accessNotes', e.target.value)}
                            placeholder="e.g., Gate code 1234"
                          />
                        </Field>

                        <Field label="Visibility">
                          <select
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                            value={meter.location?.visibility || "good"}
                            onChange={(e) => updateMeterInForm(index, 'location.visibility', e.target.value)}
                          >
                            <option value="excellent">Excellent</option>
                            <option value="good">Good</option>
                            <option value="poor">Poor</option>
                            <option value="obstructed">Obstructed</option>
                            <option value="hidden">Hidden</option>
                          </select>
                        </Field>

                        <Field label="Safety Notes">
                          <input
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                            value={meter.location?.safetyNotes || ""}
                            onChange={(e) => updateMeterInForm(index, 'location.safetyNotes', e.target.value)}
                            placeholder="e.g., Beware of dog"
                          />
                        </Field>
                      </div>
                    </div>

                    {/* Billing Settings for this meter */}
                    <div className="md:col-span-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`isBillingActive-${index}`}
                          checked={meter.isBillingActive}
                          onChange={(e) => updateMeterInForm(index, 'isBillingActive', e.target.checked)}
                          className="rounded border-slate-300"
                        />
                        <label htmlFor={`isBillingActive-${index}`} className="text-sm font-medium text-slate-700">
                          Include this meter in billing
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {err && (
            <div className="rounded-xl bg-red-50 border border-red-100 text-red-700 px-3 py-2 text-sm">
              {err}
            </div>
          )}

          <div className="flex justify-end gap-2 sticky bottom-0 bg-white py-3">
            <button
              className="rounded-xl border border-slate-200 px-4 py-2.5"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </button>
            <button
              className="rounded-xl bg-emerald-600 text-white px-4 py-2.5 font-semibold hover:bg-emerald-700"
              onClick={save}
            >
              {editing ? "Update Member" : "Save Member"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Meters Management Modal - NEW */}
      <Modal open={metersModalOpen} title="Manage Meters" onClose={() => setMetersModalOpen(false)} size="lg">
        {managingMetersFor && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="font-bold text-blue-900">{managingMetersFor.accountName}</div>
              <div className="text-sm text-blue-700 mt-1">PN No: {managingMetersFor.pnNo}</div>
            </div>
            
            <div className="space-y-4">
              {metersForm.map((meter, index) => (
                <div key={index} className="p-4 border border-slate-200 rounded-xl">
                  <div className="font-bold text-slate-900 mb-2">Meter: {meter.meterNumber}</div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-slate-500">Status</div>
                      <div className="font-bold">{meter.meterStatus}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Condition</div>
                      <div className="font-bold">{meter.meterCondition}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Location</div>
                      <div>{meter.location?.description || "—"}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Billing Active</div>
                      <div>{meter.isBillingActive ? "Yes" : "No"}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                className="rounded-xl border border-slate-200 px-4 py-2.5"
                onClick={() => setMetersModalOpen(false)}
              >
                Close
              </button>
              <button
                className="rounded-xl bg-blue-600 text-white px-4 py-2.5 font-semibold hover:bg-blue-700"
                onClick={() => {
                  // You can implement advanced meter management here
                  setMetersModalOpen(false);
                }}
              >
                Edit Meters
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-bold text-slate-900 mt-1 break-words">
        {value ?? "—"}
      </div>
    </div>
  );
}