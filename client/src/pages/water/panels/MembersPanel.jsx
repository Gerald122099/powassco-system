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

function Field({ label, children }) {
  return (
    <div>
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      {children}
    </div>
  );
}

export default function MembersPanel() {
  const { token } = useAuth();

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);

  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);

  const [err, setErr] = useState("");

  const [form, setForm] = useState({
    pnNo: "",
    accountName: "",
    classification: "residential",
    meterNumber: "",
    accountStatus: "active",
    personal: { fullName: "", gender: "other", dateRegistered: "" },
    address: {
      houseLotNo: "",
      streetSitioPurok: "",
      barangay: "",
      municipalityCity: "",
      province: "",
    },
    contact: { mobileNumber: "", email: "" },
  });

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total]
  );

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const data = await apiFetch(
        `/water/members?q=${encodeURIComponent(q)}&page=${page}&limit=${PAGE_SIZE}`,
        { token }
      );
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
  }, [q, page]);

  function openAdd() {
    setEditing(null);
    setErr("");
    setForm({
      pnNo: "",
      accountName: "",
      classification: "residential",
      meterNumber: "",
      accountStatus: "active",
      personal: { fullName: "", gender: "other", birthdate: "", dateRegistered: "" },
      address: {
        houseLotNo: "",
        streetSitioPurok: "",
        barangay: "",
        municipalityCity: "",
        province: "",
      },
      contact: { mobileNumber: "", email: "" },
    });
    setModalOpen(true);
  }

  function openEdit(m) {
    setEditing(m);
    setErr("");
    setForm({
      pnNo: m.pnNo || "",
      accountName: m.accountName || "",
      classification: m.classification || "residential",
      meterNumber: m.meterNumber || "",
      accountStatus: m.accountStatus || "active",
     personal: {
        fullName: m.personal?.fullName || "",
        gender: m.personal?.gender || "other",
        birthdate: m.personal?.birthdate ? String(m.personal.birthdate).slice(0, 10) : "",
        dateRegistered: m.personal?.dateRegistered
          ? new Date(m.personal.dateRegistered).toISOString().slice(0, 10)
          : "",
      },

      address: {
        houseLotNo: m.address?.houseLotNo || "",
        streetSitioPurok: m.address?.streetSitioPurok || "",
        barangay: m.address?.barangay || "",
        municipalityCity: m.address?.municipalityCity || "",
        province: m.address?.province || "",
      },
      contact: {
        mobileNumber: m.contact?.mobileNumber || "",
        email: m.contact?.email || "",
      },
    });
    setModalOpen(true);
  }

  function openView(m) {
    setViewing(m);
    setViewOpen(true);
  }

  async function save() {
    setErr("");

    if (!form.pnNo.trim() || !form.accountName.trim()) {
      setErr("PN No. and Account Name are required.");
      return;
    }
    if (!form.meterNumber.trim()) {
      setErr("Meter Number is required.");
      return;
    }
    if (!form.contact.mobileNumber.trim()) {
      setErr("Mobile Number is required.");
      return;
    }
    if (!form.personal.fullName.trim()) {
      setErr("Full Name of Account Holder is required.");
      return;
    }
    if (!form.personal.birthdate.trim()) {
  setErr("Birthdate is required.");
  return;
}


    try {
      const payload = {
        ...form,
        pnNo: form.pnNo.trim(),
        accountName: form.accountName.trim(),
        meterNumber: form.meterNumber.trim(),
        contact: {
          ...form.contact,
          mobileNumber: form.contact.mobileNumber.trim(),
          email: (form.contact.email || "").trim(),
        },
        personal: {
          ...form.personal,
          fullName: form.personal.fullName.trim(),
          birthdate: form.personal.birthdate, 
          dateRegistered: form.personal.dateRegistered || undefined,
        },
      };

      if (!editing) {
        await apiFetch("/water/members", { method: "POST", token, body: payload });
        setToast("✅ Member added");
      } else {
        await apiFetch(`/water/members/${editing._id}`, {
          method: "PUT",
          token,
          body: payload,
        });
        setToast("✅ Member updated");
      }

      setModalOpen(false);
      await load();
      setTimeout(() => setToast(""), 2000);
    } catch (e) {
      setErr(e.message);
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
            className="w-full sm:w-96 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
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
              <th className="py-3 px-4">Meter No.</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-600">
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-600">
                  No members found.
                </td>
              </tr>
            ) : (
              items.map((m) => (
                <tr key={m._id} className="border-t hover:bg-slate-50/60">
                  <td className="py-3 px-4 font-bold text-slate-900">{m.pnNo}</td>
                  <td className="py-3 px-4">{m.accountName}</td>
                  <td className="py-3 px-4 text-slate-700 max-w-[420px] truncate">
                    {formatAddress(m.address)}
                  </td>
                  <td className="py-3 px-4 uppercase text-xs font-bold text-emerald-700">
                    {m.classification}
                  </td>
                  <td className="py-3 px-4">{m.meterNumber}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold bg-slate-100 border-slate-200 text-slate-700">
                      {m.accountStatus}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                      onClick={() => openView(m)}
                    >
                      View
                    </button>
                    <button
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                      onClick={() => openEdit(m)}
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
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

      {/* View Modal */}
      <Modal open={viewOpen} title="Member Details" onClose={() => setViewOpen(false)}>
        {viewing && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Info label="PN No." value={viewing.pnNo} />
              <Info label="Account Name" value={viewing.accountName} />
              <Info label="Classification" value={viewing.classification} />
              <Info label="Account Status" value={viewing.accountStatus} />
              <Info label="Meter Number" value={viewing.meterNumber} />
              <Info label="Mobile Number" value={viewing.contact?.mobileNumber} />
              <Info label="Email" value={viewing.contact?.email || "—"} />
              <Info label="Date Registered" value={viewing.personal?.dateRegistered ? new Date(viewing.personal.dateRegistered).toLocaleDateString() : "—"} />
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="font-bold text-slate-900">Address</div>
              <div className="text-sm text-slate-700 mt-2">{formatAddress(viewing.address) || "—"}</div>
            </div>
          </div>
        )}
      </Modal>

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} title={editing ? "Edit Member" : "Add Member"} onClose={() => setModalOpen(false)}>
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="font-bold text-slate-900">Account Details</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="PN No. (Account Number)">
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.pnNo}
                  onChange={(e) => setForm({ ...form, pnNo: e.target.value })}
                />
              </Field>

              <Field label="Account Name">
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.accountName}
                  onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                />
              </Field>

              <Field label="Classification">
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.classification}
                  onChange={(e) => setForm({ ...form, classification: e.target.value })}
                >
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="other">Other</option>
                </select>
              </Field>

              <Field label="Meter Number">
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.meterNumber}
                  onChange={(e) => setForm({ ...form, meterNumber: e.target.value })}
                />
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
                </select>
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="font-bold text-slate-900">Personal / Household Details</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Full Name of Account Holder">
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.personal.fullName}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      personal: { ...form.personal, fullName: e.target.value },
                    })
                  }
                />
              </Field>

              <Field label="Birthdate">
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

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="font-bold text-slate-900">Address Information</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="House No. / Lot No.">
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.address.houseLotNo}
                  onChange={(e)=>setForm({...form,address:{...form.address,houseLotNo:e.target.value}})}
                />
              </Field>
              <Field label="Street / Sitio / Purok">
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.address.streetSitioPurok}
                  onChange={(e)=>setForm({...form,address:{...form.address,streetSitioPurok:e.target.value}})}
                />
              </Field>
              <Field label="Barangay">
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.address.barangay}
                  onChange={(e)=>setForm({...form,address:{...form.address,barangay:e.target.value}})}
                />
              </Field>
              <Field label="Municipality / City">
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.address.municipalityCity}
                  onChange={(e)=>setForm({...form,address:{...form.address,municipalityCity:e.target.value}})}
                />
              </Field>
              <Field label="Province">
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.address.province}
                  onChange={(e)=>setForm({...form,address:{...form.address,province:e.target.value}})}
                />
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="font-bold text-slate-900">Contact Information</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Mobile Number">
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.contact.mobileNumber}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      contact: { ...form.contact, mobileNumber: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Email Address (optional)">
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={form.contact.email}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      contact: { ...form.contact, email: e.target.value },
                    })
                  }
                />
              </Field>
            </div>
          </div>

          {err && (
            <div className="rounded-xl bg-red-50 border border-red-100 text-red-700 px-3 py-2 text-sm">
              {err}
            </div>
          )}

          <div className="flex justify-end gap-2">
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
              Save
            </button>
          </div>
        </div>
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
