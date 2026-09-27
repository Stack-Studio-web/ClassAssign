import React, { useCallback, useEffect, useState } from "react";
import api from "../lib/api";
import { useToast } from "../context/ToastContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";

export default function OwnershipMapping() {
  const toast = useToast();
  const [counts, setCounts] = useState([]);
  const [facultyIncharges, setFacultyIncharges] = useState([]);
  const [table, setTable] = useState("students");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [countsRes, fiRes] = await Promise.all([
        api.get("/ownership/unowned-counts"),
        api.get("/ownership/faculty-incharges"),
      ]);
      setCounts(countsRes.data?.data?.counts ?? countsRes.data?.counts ?? []);
      setFacultyIncharges(
        fiRes.data?.data?.facultyIncharges ?? fiRes.data?.facultyIncharges ?? []
      );
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Load failed"));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAssign = async () => {
    if (!table || !ownerUserId) {
      toast.warning("Select a table and Faculty Incharge.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post("/ownership/assign", {
        table,
        ownerUserId: Number(ownerUserId),
      });
      const updated = res.data?.data?.updated ?? res.data?.updated ?? 0;
      toast.success(`Assigned ownership to ${updated} unowned row(s).`);
      load();
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Assign failed"));
    } finally {
      setSaving(false);
    }
  };

  const handleBackfillExams = async () => {
    setSaving(true);
    try {
      const res = await api.post("/ownership/backfill-exams");
      const updated = res.data?.data?.updated ?? res.data?.updated ?? 0;
      toast.success(`Backfilled exam ownership for ${updated} exam(s).`);
      load();
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Backfill failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
            <ShieldCheckIcon className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Faculty Incharge Ownership Mapping
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Assign existing unowned records to a Faculty Incharge. Strict isolation only
              applies after ownership is set. Do not assign randomly.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Unowned records</h2>
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {counts.map((c) => (
                <div
                  key={c.table}
                  className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3"
                >
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{c.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {c.unowned == null ? "—" : c.unowned}
                  </p>
                  {c.error && <p className="text-xs text-red-600 mt-1">{c.error}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">Assign unowned rows</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Table</label>
              <select
                value={table}
                onChange={(e) => setTable(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
              >
                {counts.map((c) => (
                  <option key={c.table} value={c.table}>
                    {c.label} ({c.unowned ?? 0} unowned)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Faculty Incharge
              </label>
              <select
                value={ownerUserId}
                onChange={(e) => setOwnerUserId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="">Select Faculty Incharge</option>
                {facultyIncharges.map((fi) => (
                  <option key={fi.id} value={fi.id}>
                    {fi.username}
                    {fi.department ? ` · ${fi.department}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleAssign}
              className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Working…" : "Assign Ownership"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleBackfillExams}
              className="px-4 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50"
            >
              Backfill Exams from Seating Plans
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
