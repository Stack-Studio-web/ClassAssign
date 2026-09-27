import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";
import {
  AcademicCapIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

const EMPTY_FORM = {
  label: "",
  department: "",
  academicYear: "",
  batch: "",
  semester: "",
  hodUserId: "",
  facultyInchargeIds: [],
};

export default function AcademicContextAdmin() {
  const toast = useToast();
  const showConfirm = useConfirm();
  const [contexts, setContexts] = useState([]);
  const [hods, setHods] = useState([]);
  const [fis, setFis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ctxRes, metaRes] = await Promise.all([
        api.get("/academic-contexts"),
        api.get("/academic-contexts/meta/candidates"),
      ]);
      setContexts(ctxRes.data?.data?.contexts ?? ctxRes.data?.contexts ?? []);
      setHods(metaRes.data?.data?.hods ?? metaRes.data?.hods ?? []);
      setFis(metaRes.data?.data?.facultyIncharges ?? metaRes.data?.facultyIncharges ?? []);
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Load failed"));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (ctx) => {
    setEditing(ctx);
    setForm({
      label: ctx.label || "",
      department: ctx.department || "",
      academicYear: ctx.academicYear || "",
      batch: ctx.batch || "",
      semester: ctx.semester || "",
      hodUserId: String(ctx.hodUserId || ""),
      facultyInchargeIds: (ctx.members || [])
        .filter((m) => m.role === "faculty_incharge")
        .map((m) => m.userId),
    });
    setShowForm(true);
  };

  const toggleFi = (id) => {
    setForm((prev) => {
      const has = prev.facultyInchargeIds.includes(id);
      return {
        ...prev,
        facultyInchargeIds: has
          ? prev.facultyInchargeIds.filter((x) => x !== id)
          : [...prev.facultyInchargeIds, id],
      };
    });
  };

  const availableFis = useMemo(() => {
    const hodId = Number(form.hodUserId) || null;
    return fis.filter((fi) => {
      if (hodId && fi.createdByHodId && Number(fi.createdByHodId) !== hodId) {
        // Still allow selection — admin can reassign
      }
      if (editing && fi.academicContextId && fi.academicContextId !== editing.id) {
        return true; // can move into this context
      }
      return true;
    });
  }, [fis, form.hodUserId, editing]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.department.trim() || !form.hodUserId) {
      toast.warning("Department and HOD are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        label: form.label.trim() || `${form.department.trim().toUpperCase()} Academic Context`,
        department: form.department.trim(),
        academicYear: form.academicYear.trim() || null,
        batch: form.batch.trim() || null,
        semester: form.semester.trim() || null,
        hodUserId: Number(form.hodUserId),
        facultyInchargeIds: form.facultyInchargeIds,
      };
      if (editing) {
        await api.put(`/academic-contexts/${editing.uuid}`, payload);
        toast.success("Academic context updated.");
      } else {
        await api.post("/academic-contexts", payload);
        toast.success("Academic context created.");
      }
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ctx) => {
    const ok = await showConfirm(`Deactivate academic context "${ctx.label}"?`);
    if (!ok) return;
    try {
      await api.delete(`/academic-contexts/${ctx.uuid}`);
      toast.success("Academic context deactivated.");
      load();
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Delete failed"));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
              <AcademicCapIcon className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Academic Contexts</h1>
              <p className="text-sm text-gray-500 mt-1">
                Shared data boundary for a HOD and their Faculty Incharges.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700"
          >
            <PlusIcon className="h-4 w-4" />
            Create Academic Context
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
            </div>
          ) : contexts.length === 0 ? (
            <p className="p-10 text-center text-gray-500">No academic contexts yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {contexts.map((ctx) => (
                <div key={ctx.uuid} className="p-5 flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900">{ctx.label}</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {ctx.department}
                      {ctx.batch ? ` · ${ctx.batch}` : ""}
                      {ctx.academicYear ? ` · ${ctx.academicYear}` : ""}
                      {ctx.semester ? ` · Sem ${ctx.semester}` : ""}
                    </p>
                    <p className="text-sm text-gray-600 mt-2">
                      HOD: <span className="font-medium">{ctx.hodName || "—"}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(ctx.members || [])
                        .filter((m) => m.role === "faculty_incharge")
                        .map((m) => (
                          <span
                            key={m.userId}
                            className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100"
                          >
                            {m.username}
                          </span>
                        ))}
                      {(ctx.members || []).filter((m) => m.role === "faculty_incharge").length ===
                        0 && (
                        <span className="text-xs text-gray-400">No Faculty Incharges assigned</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(ctx)}
                      className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                      title="Edit"
                    >
                      <PencilSquareIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(ctx)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      title="Deactivate"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold text-gray-900">
                {editing ? "Edit Academic Context" : "Create Academic Context"}
              </h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-400">
                Close
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3">
              <label className="block text-sm">
                <span className="text-gray-600">Label</span>
                <input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  placeholder="CSE - 2024-2028"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="text-gray-600">Department</span>
                  <input
                    required
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="BCS"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-gray-600">Academic Year</span>
                  <input
                    value={form.academicYear}
                    onChange={(e) => setForm({ ...form, academicYear: e.target.value })}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="2026"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-gray-600">Batch</span>
                  <input
                    value={form.batch}
                    onChange={(e) => setForm({ ...form, batch: e.target.value })}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="2024-2028"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-gray-600">Semester</span>
                  <input
                    value={form.semester}
                    onChange={(e) => setForm({ ...form, semester: e.target.value })}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="5"
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-gray-600">HOD</span>
                <select
                  required
                  value={form.hodUserId}
                  onChange={(e) => setForm({ ...form, hodUserId: e.target.value })}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                >
                  <option value="">Select HOD</option>
                  {hods.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.username} ({h.department || "—"})
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <p className="text-sm text-gray-600 mb-2">Faculty Incharges</p>
                <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-xl divide-y">
                  {availableFis.length === 0 ? (
                    <p className="p-3 text-xs text-gray-400">No Faculty Incharge users found.</p>
                  ) : (
                    availableFis.map((fi) => (
                      <label
                        key={fi.id}
                        className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={form.facultyInchargeIds.includes(fi.id)}
                          onChange={() => toggleFi(fi.id)}
                        />
                        <span className="font-medium text-gray-800">{fi.username}</span>
                        <span className="text-xs text-gray-400 ml-auto">{fi.department || ""}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
                >
                  {saving ? "Saving…" : editing ? "Save Changes" : "Create Academic Context"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
