// src/pages/meter/panels/BatchManagementPanel.jsx
import { useState, useEffect } from "react";
import Card from "../../../components/Card";
import Modal from "../../../components/Modal";
import { apiFetch, apiDownload } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";
import {
  Plus,
  Edit,
  Trash2,
  Download,
  Upload,
  Users,
  MapPin,
  User,
  ChevronDown,
  ChevronUp,
  Save,
  X,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  FileText,
  XCircle,
  Database,
} from "lucide-react";

export default function BatchManagementPanel() {
  const { token, user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [availableMembers, setAvailableMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [expandedBatches, setExpandedBatches] = useState({});
  const [periodKey, setPeriodKey] = useState(new Date().toISOString().slice(0, 7));
  const [importResults, setImportResults] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [previewData, setPreviewData] = useState(null);
  
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  
  const [newBatch, setNewBatch] = useState({
    batchName: "",
    readerName: "",
    readerId: "",
    area: ""
  });

  const loadBatches = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/water/batches", { token });
      setBatches(data.batches || []);
      setAvailableMembers(data.availableMembers || []);
    } catch (error) {
      console.error("Failed to load batches:", error);
      alert("Failed to load batches");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  const createBatch = async () => {
    if (!newBatch.batchName || !newBatch.readerName || !newBatch.readerId) {
      alert("Please fill all required fields");
      return;
    }

    try {
      const response = await apiFetch("/water/batches", {
        method: "POST",
        token,
        body: newBatch
      });
      
      setBatches([...batches, response]);
      setShowCreateModal(false);
      setNewBatch({ batchName: "", readerName: "", readerId: "", area: "" });
      alert("Batch created successfully");
    } catch (error) {
      alert("Failed to create batch: " + error.message);
    }
  };

  const addMembersToBatch = async () => {
    if (!selectedBatch || selectedMemberIds.length === 0) {
      alert("Please select at least one member");
      return;
    }

    try {
      const response = await apiFetch(`/water/batches/${selectedBatch._id}/members`, {
        method: "POST",
        token,
        body: { memberIds: selectedMemberIds }
      });
      
      console.log("Members added:", response);
      
      setBatches(batches.map(b => 
        b._id === response._id ? response : b
      ));
      
      setAvailableMembers(availableMembers.filter(m => !selectedMemberIds.includes(m._id)));
      
      setSelectedMemberIds([]);
      setSelectAll(false);
      setShowAddMembersModal(false);
      alert(`${selectedMemberIds.length} members added to batch`);
    } catch (error) {
      alert("Failed to add members: " + error.message);
    }
  };

  const handleMemberSelect = (memberId) => {
    setSelectedMemberIds(prev => {
      if (prev.includes(memberId)) {
        return prev.filter(id => id !== memberId);
      } else {
        return [...prev, memberId];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(availableMembers.map(m => m._id));
    }
    setSelectAll(!selectAll);
  };

  useEffect(() => {
    if (availableMembers.length > 0 && selectedMemberIds.length === availableMembers.length) {
      setSelectAll(true);
    } else {
      setSelectAll(false);
    }
  }, [selectedMemberIds, availableMembers]);

  const removeMemberFromBatch = async (batchId, memberId) => {
    if (!confirm("Remove this member from batch?")) return;

    try {
      await apiFetch(`/water/batches/${batchId}/members/${memberId}`, {
        method: "DELETE",
        token
      });
      
      await loadBatches();
    } catch (error) {
      alert("Failed to remove member: " + error.message);
    }
  };

  const exportBatch = async () => {
    if (!selectedBatch) return;

    try {
      await apiDownload(
        `/water/batches/${selectedBatch._id}/export?periodKey=${periodKey}`,
        {
          token,
          filename: `batch_${selectedBatch.batchNumber}_${periodKey}.csv`
        }
      );
      
      setShowExportModal(false);
      alert("Batch exported successfully");
    } catch (error) {
      alert("Export failed: " + error.message);
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImportFile(file);
    setPreviewData(null);
    
    if (file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const jsonData = JSON.parse(e.target.result);
          setPreviewData(jsonData);
          
          const preview = [
            "JSON file detected",
            `Reader: ${jsonData.readerName} (${jsonData.readerId})`,
            `Period: ${jsonData.periodKey}`,
            `Export Date: ${jsonData.exportDate}`,
            `Readings: ${jsonData.readings?.length || 0}`,
          ];
          setImportPreview(preview);
        } catch (error) {
          console.error("Preview error:", error);
          setImportPreview(["Error previewing JSON file"]);
        }
      };
      reader.readAsText(file);
    }
    else if (file.name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const lines = text.split('\n').slice(0, 11);
          setImportPreview(lines);
        } catch (error) {
          console.error("Preview error:", error);
          setImportPreview(["Error previewing CSV file"]);
        }
      };
      reader.readAsText(file);
    }
    else if (file.name.endsWith('.db') || file.name.endsWith('.sqlite') || file.name.endsWith('.sqlite3')) {
      setImportPreview([
        "SQLite database file detected.",
        "File: " + file.name,
        "Size: " + (file.size / 1024).toFixed(2) + " KB",
        "",
        "Click 'Import Readings' to process this file."
      ]);
    }
    else {
      setImportPreview(["Unsupported file type. Please upload JSON, CSV, or SQLite files."]);
    }
  };

  const importReadings = async () => {
    if (!importFile) return;

    try {
      if (importFile.name.endsWith('.json')) {
        const text = await importFile.text();
        const jsonData = JSON.parse(text);
        
        console.log("Imported JSON:", jsonData);
        
        const readings = jsonData.readings || [];
        
        if (readings.length === 0) {
          alert("No readings found in the file");
          return;
        }
        
        const uniqueReadings = [];
        const seen = new Set();
        
        for (const reading of readings) {
          const key = `${reading.pnNo}-${reading.meterNumber}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueReadings.push(reading);
          } else {
            console.warn(`Duplicate reading in file: ${reading.pnNo} - ${reading.meterNumber}`);
          }
        }
        
        if (uniqueReadings.length !== readings.length) {
          console.log(`Removed ${readings.length - uniqueReadings.length} duplicates from file`);
        }
        
        const response = await apiFetch("/water/batches/import-readings", {
          method: "POST",
          token,
          body: {
            readings: uniqueReadings,
            periodKey: jsonData.periodKey || periodKey,
            readerName: jsonData.readerName || "Mobile Reader",
            readerId: jsonData.readerId || "mobile",
            importDate: new Date(),
            forceUpdate: false
          }
        });
        
        setImportResults(response);
      }
      else if (importFile.name.endsWith('.csv')) {
        const text = await importFile.text();
        const lines = text.split('\n');
        
        const readings = [];
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          
          const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
          
          const reading = {
            pnNo: values[0] || "",
            meterNumber: values[1] || "",
            previousReading: parseFloat(values[2]) || 0,
            presentReading: parseFloat(values[3]) || 0,
            consumptionMultiplier: parseFloat(values[4]) || 1,
            readDate: values[5] || new Date().toISOString(),
            readBy: values[6] || "mobile_app",
          };
          
          if (reading.pnNo && reading.meterNumber) {
            readings.push(reading);
          }
        }
        
        if (readings.length === 0) {
          alert("No valid readings found in CSV file");
          return;
        }
        
        const response = await apiFetch("/water/batches/import-readings", {
          method: "POST",
          token,
          body: {
            readings,
            periodKey,
            readerName: "Mobile Reader",
            readerId: "mobile001",
            importDate: new Date()
          }
        });
        
        setImportResults(response);
      }
      else if (importFile.name.endsWith('.db') || importFile.name.endsWith('.sqlite')) {
        const formData = new FormData();
        formData.append('file', importFile);
        formData.append('periodKey', periodKey);
        
        const response = await fetch('/api/water/batches/import-sqlite', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
        
        const result = await response.json();
        setImportResults(result);
        return;
      }
      else {
        alert("Unsupported file type. Please upload JSON, CSV, or SQLite files.");
      }
    } catch (error) {
      console.error("Import error:", error);
      alert("Import failed: " + error.message);
    }
  };

  const toggleBatchExpansion = (batchId) => {
    setExpandedBatches(prev => ({
      ...prev,
      [batchId]: !prev[batchId]
    }));
  };

  return (
    <Card>
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-lg font-black text-slate-900">Batch Management</div>
            <div className="text-xs text-slate-600 mt-1">
              Create batches for meter readers, export to mobile app, import readings
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700"
            >
              <Plus size={16} />
              New Batch
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 rounded-xl bg-blue-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-blue-700"
            >
              <Upload size={16} />
              Import Readings
            </button>

            <button
              onClick={loadBatches}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-10">Loading batches...</div>
        ) : batches.length === 0 ? (
          <div className="text-center py-10 text-slate-500">
            No batches created yet. Click "New Batch" to create one.
          </div>
        ) : (
          batches.map(batch => (
            <div key={batch._id} className="border rounded-xl overflow-hidden">
              <div
                className="bg-slate-50 p-4 flex items-center justify-between cursor-pointer hover:bg-slate-100"
                onClick={() => toggleBatchExpansion(batch._id)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <Users size={20} className="text-blue-600" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">
                      {batch.batchNumber} - {batch.batchName}
                    </div>
                    <div className="text-sm text-slate-600 flex items-center gap-2 mt-1">
                      <User size={14} />
                      {batch.readerName} ({batch.readerId})
                      {batch.area && (
                        <>
                          <span>•</span>
                          <MapPin size={14} />
                          {batch.area}
                        </>
                      )}
                      <span>•</span>
                      <span>{batch.members?.length || 0} members</span>
                      <span>•</span>
                      <span>{batch.meterNumbers?.length || 0} meters</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBatch(batch);
                      setShowExportModal(true);
                    }}
                    className="p-2 hover:bg-white rounded-lg"
                    title="Export Batch"
                  >
                    <Download size={18} className="text-blue-600" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBatch(batch);
                      setSelectedMemberIds([]);
                      setSelectAll(false);
                      setShowAddMembersModal(true);
                    }}
                    className="p-2 hover:bg-white rounded-lg"
                    title="Add Members"
                  >
                    <Plus size={18} className="text-emerald-600" />
                  </button>
                  {expandedBatches[batch._id] ? (
                    <ChevronUp size={20} className="text-slate-400" />
                  ) : (
                    <ChevronDown size={20} className="text-slate-400" />
                  )}
                </div>
              </div>

              {expandedBatches[batch._id] && (
                <div className="p-4 border-t">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="py-2 px-3 text-left">PN No</th>
                        <th className="py-2 px-3 text-left">Account Name</th>
                        <th className="py-2 px-3 text-left">Meters</th>
                        <th className="py-2 px-3 text-left">Barangay</th>
                        <th className="py-2 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batch.members && batch.members.length > 0 ? (
                        batch.members.map(member => (
                          <tr key={member._id} className="border-t hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono font-bold">{member.pnNo}</td>
                            <td className="py-2 px-3">{member.accountName}</td>
                            <td className="py-2 px-3">
                              {member.meters
                                ?.filter(m => m.meterStatus === "active")
                                .map(m => m.meterNumber)
                                .join(", ") || "—"}
                            </td>
                            <td className="py-2 px-3">{member.address?.barangay || "—"}</td>
                            <td className="py-2 px-3 text-right">
                              <button
                                onClick={() => removeMemberFromBatch(batch._id, member._id)}
                                className="text-red-600 hover:text-red-800 p-1"
                                title="Remove from batch"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-slate-500">
                            No members in this batch
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <Modal open={showCreateModal} title="Create New Batch" onClose={() => setShowCreateModal(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-700">Batch Name *</label>
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={newBatch.batchName}
              onChange={(e) => setNewBatch({ ...newBatch, batchName: e.target.value })}
              placeholder="e.g., North Area - Juan"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700">Reader Name *</label>
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={newBatch.readerName}
              onChange={(e) => setNewBatch({ ...newBatch, readerName: e.target.value })}
              placeholder="e.g., Juan Dela Cruz"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700">Reader ID *</label>
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={newBatch.readerId}
              onChange={(e) => setNewBatch({ ...newBatch, readerId: e.target.value })}
              placeholder="e.g., RD001"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700">Area (Optional)</label>
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={newBatch.area}
              onChange={(e) => setNewBatch({ ...newBatch, area: e.target.value })}
              placeholder="e.g., Barangay San Jose"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2.5 border rounded-xl hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={createBatch}
              className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700"
            >
              Create Batch
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showAddMembersModal} title={`Add Members to ${selectedBatch?.batchName}`} onClose={() => {
        setShowAddMembersModal(false);
        setSelectedMemberIds([]);
        setSelectAll(false);
      }} size="lg">
        {selectedBatch && (
          <div className="space-y-4">
            <div className="text-sm text-slate-600">
              Select members to add to this batch. Members can only belong to one batch.
            </div>
            <div className="max-h-96 overflow-auto border rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="py-3 px-3 text-left w-12">
                      <input 
                        type="checkbox" 
                        className="rounded w-4 h-4"
                        checked={selectAll}
                        onChange={handleSelectAll}
                        disabled={availableMembers.length === 0}
                      />
                    </th>
                    <th className="py-3 px-3 text-left">PN No</th>
                    <th className="py-3 px-3 text-left">Account Name</th>
                    <th className="py-3 px-3 text-left">Meters</th>
                    <th className="py-3 px-3 text-left">Barangay</th>
                  </tr>
                </thead>
                <tbody>
                  {availableMembers.length > 0 ? (
                    availableMembers.map(member => (
                      <tr key={member._id} className="border-t hover:bg-slate-50">
                        <td className="py-3 px-3">
                          <input 
                            type="checkbox" 
                            className="rounded w-4 h-4"
                            checked={selectedMemberIds.includes(member._id)}
                            onChange={() => handleMemberSelect(member._id)}
                          />
                        </td>
                        <td className="py-3 px-3 font-mono font-bold">{member.pnNo}</td>
                        <td className="py-3 px-3">{member.accountName}</td>
                        <td className="py-3 px-3">
                          {member.meters
                            ?.filter(m => m.meterStatus === "active")
                            .map(m => m.meterNumber)
                            .join(", ") || "—"}
                        </td>
                        <td className="py-3 px-3">{member.address?.barangay || "—"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        No available members to add
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600">
                Selected: <span className="font-bold">{selectedMemberIds.length}</span> members
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowAddMembersModal(false);
                    setSelectedMemberIds([]);
                    setSelectAll(false);
                  }}
                  className="px-4 py-2.5 border rounded-xl hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={addMembersToBatch}
                  disabled={selectedMemberIds.length === 0}
                  className={`px-4 py-2.5 rounded-xl font-semibold ${
                    selectedMemberIds.length > 0
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-slate-200 text-slate-500 cursor-not-allowed"
                  }`}
                >
                  Add Selected ({selectedMemberIds.length})
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showExportModal} title={`Export ${selectedBatch?.batchName}`} onClose={() => setShowExportModal(false)}>
        {selectedBatch && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-slate-700">Billing Period</label>
              <input
                type="month"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                value={periodKey}
                onChange={(e) => setPeriodKey(e.target.value)}
              />
            </div>
            <div className="bg-blue-50 p-4 rounded-xl">
              <div className="text-sm text-blue-700">
                <strong>Export Summary:</strong>
              </div>
              <ul className="mt-2 text-sm text-blue-600 space-y-1">
                <li>• {selectedBatch.members?.length || 0} members</li>
                <li>• {selectedBatch.meterNumbers?.length || 0} active meters</li>
                <li>• Format: CSV (compatible with mobile app)</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2.5 border rounded-xl hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={exportBatch}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
              >
                <Download size={16} />
                Export CSV
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showImportModal} title="Import Readings from Mobile App" onClose={() => {
        setShowImportModal(false);
        setImportFile(null);
        setImportPreview([]);
        setPreviewData(null);
        setImportResults(null);
      }} size="lg">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-700">Billing Period</label>
            <input
              type="month"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={periodKey}
              onChange={(e) => setPeriodKey(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">Import File</label>
            <input
              type="file"
              accept=".csv,.json,.db,.sqlite,.sqlite3"
              onChange={handleImportFile}
              className="mt-1 w-full"
            />
          </div>

          {previewData && previewData.readings && previewData.readings.length > 0 && (
            <div className="border rounded-xl p-4">
              <div className="font-semibold mb-3 flex items-center justify-between">
                <span>Readings Preview ({previewData.readings.length} records)</span>
                <span className="text-xs text-slate-500">
                  Reader: {previewData.readerName} | Period: {previewData.periodKey}
                </span>
              </div>
              <div className="overflow-auto max-h-64 border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="py-2 px-3 text-left">PN No</th>
                      <th className="py-2 px-3 text-left">Meter</th>
                      <th className="py-2 px-3 text-right">Previous</th>
                      <th className="py-2 px-3 text-right">Present</th>
                      <th className="py-2 px-3 text-right">Consumption</th>
                      <th className="py-2 px-3 text-left">Read Date</th>
                      <th className="py-2 px-3 text-left">Read By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.readings.slice(0, 10).map((reading, index) => (
                      <tr key={index} className="border-t hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono font-bold">{reading.pnNo}</td>
                        <td className="py-2 px-3 font-mono">{reading.meterNumber}</td>
                        <td className="py-2 px-3 text-right">{reading.previousReading?.toFixed(3)}</td>
                        <td className="py-2 px-3 text-right">{reading.presentReading?.toFixed(3)}</td>
                        <td className="py-2 px-3 text-right font-semibold text-blue-600">
                          {reading.consumption?.toFixed(2)} m³
                        </td>
                        <td className="py-2 px-3">
                          {reading.readDate ? new Date(parseInt(reading.readDate)).toLocaleDateString() : '-'}
                        </td>
                        <td className="py-2 px-3">{reading.readBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewData.readings.length > 10 && (
                <div className="mt-2 text-xs text-slate-500 text-center">
                  Showing first 10 of {previewData.readings.length} readings
                </div>
              )}
            </div>
          )}

          {importPreview.length > 0 && !previewData && (
            <div className="border rounded-xl p-4">
              <div className="font-semibold mb-2">Preview (first 10 rows):</div>
              <pre className="text-xs bg-slate-50 p-2 rounded overflow-auto max-h-40">
                {importPreview.join('\n')}
              </pre>
            </div>
          )}

          {importResults && (
            <div className="border rounded-xl p-4">
              <div className="font-semibold mb-3">Import Results:</div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-green-50 p-3 rounded-lg text-center">
                  <div className="text-xs text-green-600">Success</div>
                  <div className="text-2xl font-bold text-green-700">{importResults.success}</div>
                </div>
                <div className="bg-red-50 p-3 rounded-lg text-center">
                  <div className="text-xs text-red-600">Failed</div>
                  <div className="text-2xl font-bold text-red-700">{importResults.failed}</div>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg text-center">
                  <div className="text-xs text-amber-600">Skipped</div>
                  <div className="text-2xl font-bold text-amber-700">{importResults.skipped}</div>
                </div>
              </div>

              {importResults.details && (
                <div className="max-h-60 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="py-2 px-2 text-left">PN No</th>
                        <th className="py-2 px-2 text-left">Meter</th>
                        <th className="py-2 px-2 text-center">Status</th>
                        <th className="py-2 px-2 text-left">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResults.details.map((detail, i) => (
                        <tr key={i} className="border-t">
                          <td className="py-2 px-2 font-mono">{detail.pnNo}</td>
                          <td className="py-2 px-2">{detail.meterNumber}</td>
                          <td className="py-2 px-2 text-center">
                            {detail.status === "success" ? (
                              <CheckCircle size={14} className="text-green-600 inline" />
                            ) : detail.status === "skipped" ? (
                              <AlertCircle size={14} className="text-amber-600 inline" />
                            ) : (
                              <XCircle size={14} className="text-red-600 inline" />
                            )}
                          </td>
                          <td className="py-2 px-2">{detail.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowImportModal(false);
                setImportFile(null);
                setImportPreview([]);
                setPreviewData(null);
                setImportResults(null);
              }}
              className="px-4 py-2.5 border rounded-xl hover:bg-slate-50"
            >
              Close
            </button>
            {importFile && !importResults && (
              <button
                onClick={importReadings}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700"
              >
                <Database size={16} />
                Import Readings
              </button>
            )}
          </div>
        </div>
      </Modal>
    </Card>
  );
}