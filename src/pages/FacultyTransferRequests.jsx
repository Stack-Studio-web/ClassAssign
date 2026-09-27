import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  EyeIcon,
  XMarkIcon,
  ArrowsRightLeftIcon,
  UserPlusIcon,
  NoSymbolIcon,
} from "@heroicons/react/24/outline";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";

const STATUS_BADGE = {
  Pending: "bg-amber-50 text-amber-800 border-amber-200",
  Approved: "bg-green-50 text-green-800 border-green-200",
  Rejected: "bg-red-50 text-red-800 border-red-200",
  Cancelled: "bg-slate-100 text-slate-700 border-slate-200",
};

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${
        STATUS_BADGE[status] || "bg-gray-100 text-gray-700 border-gray-200"
      }`}
    >
      {status}
    </span>
  );
}

function formatWhen(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

export default function FacultyTransferRequests() {
  const toast = useToast();
  const showConfirm = useConfirm();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: "",
    examDate: "",
    session: "",
    search: "",
  });
  const [selected, setSelected] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.examDate) params.examDate = filters.examDate;
      if (filters.session) params.session = filters.session;
      const res = await api.get("/faculty-transfers", { params });
      setRequests(res.data?.data?.requests ?? res.data?.requests ?? []);
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Load failed"));
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.examDate, filters.session, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) => {
      const hay = [
        r.currentFaculty?.name,
        r.requestedFaculty?.name,
        r.requestedFaculty?.email,
        r.exam?.name,
        r.exam?.code,
        r.venue?.name,
        r.reason,
        r.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [requests, filters.search]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  const handleCancel = async (uuid) => {
    const ok = await showConfirm(
      "Cancel this mutual faculty request? This is an administrative override and does not transfer the assignment."
    );
    if (!ok) return;
    setActionLoading(uuid);
    try {
      await api.post(`/faculty-transfers/${uuid}/cancel`);
      toast.success("Mutual change request cancelled.");
      setSelected(null);
      load();
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Cancel failed"));
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
              <ArrowsRightLeftIcon className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Mutual Faculty Requests
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                View mutual faculty change history. Approvals are handled by the requested faculty.
                You may cancel pending requests in exceptional cases.
              </p>
            </div>
          </div>
          <Link
            to="/change"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shrink-0"
          >
            <UserPlusIcon className="h-4 w-4" />
            Change Faculty
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b flex flex-wrap gap-2">
            <div className="relative">
              <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search…"
                value={filters.search}
                onChange={(e) => {
                  setFilters({ ...filters, search: e.target.value });
                  setPage(1);
                }}
                className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl w-48 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <input
              type="date"
              value={filters.examDate}
              onChange={(e) => setFilters({ ...filters, examDate: e.target.value })}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl"
            />
            <select
              value={filters.session}
              onChange={(e) => setFilters({ ...filters, session: e.target.value })}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl"
            >
              <option value="">All Sessions</option>
              <option value="FN">FN</option>
              <option value="AN">AN</option>
            </select>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl"
            >
              <option value="">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700"
            >
              <FunnelIcon className="h-4 w-4" />
              Filter
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80 text-xs uppercase tracking-wide text-gray-500">
                    <th className="text-left px-5 py-3">Requested By</th>
                    <th className="text-left px-5 py-3">Requested To</th>
                    <th className="text-left px-5 py-3">Course / Venue</th>
                    <th className="text-left px-5 py-3">Date / Time</th>
                    <th className="text-left px-5 py-3">Status</th>
                    <th className="text-left px-5 py-3">Requested At</th>
                    <th className="text-right px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map((r) => (
                    <tr key={r.uuid} className="hover:bg-gray-50/60">
                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-900">{r.currentFaculty?.name}</div>
                        <div className="text-xs text-gray-500">{r.currentFaculty?.email}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-900">
                          {r.requestedFaculty?.name || "—"}
                        </div>
                        <div className="text-xs text-gray-500">{r.requestedFaculty?.email}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div>
                          {r.exam?.code ? `${r.exam.code} · ` : ""}
                          {r.exam?.name}
                        </div>
                        <div className="text-xs text-gray-500">{r.venue?.name}</div>
                      </td>
                      <td className="px-5 py-4 text-gray-600">
                        <div>
                          {r.examDate} · {r.session}
                        </div>
                        <div className="text-xs text-gray-500">{r.exam?.time || "—"}</div>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-5 py-4 text-gray-600 text-xs">{formatWhen(r.requestedAt)}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setSelected(r)}
                            className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                            title="View"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>
                          {r.status === "Pending" && (
                            <button
                              type="button"
                              disabled={actionLoading === r.uuid}
                              onClick={() => handleCancel(r.uuid)}
                              className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-40"
                              title="Cancel (override)"
                            >
                              <NoSymbolIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="p-10 text-center text-gray-500">No mutual faculty requests found.</p>
              )}
            </div>
          )}

          {filtered.length > 0 && (
            <div className="px-5 py-4 border-t flex justify-between items-center text-sm text-gray-500">
              <span>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of{" "}
                {filtered.length}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 border rounded-lg disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={page * pageSize >= filtered.length}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 border rounded-lg disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-bold text-gray-900">Request History</h3>
              <button type="button" onClick={() => setSelected(null)}>
                <XMarkIcon className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <StatusBadge status={selected.status} />
            <div className="text-sm space-y-2 border border-slate-100 rounded-xl p-4 bg-slate-50">
              <p className="font-medium text-slate-800">{selected.currentFaculty?.name}</p>
              <p className="text-slate-500 text-xs pl-2">↓ Requested change</p>
              <p className="font-medium text-slate-800">{selected.requestedFaculty?.name || "—"}</p>
              {selected.status === "Approved" && (
                <>
                  <p className="text-slate-500 text-xs pl-2">↓ Approved</p>
                  <p className="text-slate-500 text-xs pl-2">↓ Assignment transferred</p>
                  <p className="text-slate-500 text-xs pl-2">↓ Attendance transferred</p>
                </>
              )}
              {selected.status === "Rejected" && (
                <p className="text-slate-500 text-xs pl-2">↓ Rejected</p>
              )}
              {selected.status === "Cancelled" && (
                <p className="text-slate-500 text-xs pl-2">↓ Cancelled</p>
              )}
            </div>
            <div className="text-sm space-y-2">
              <p>
                <span className="text-gray-500">Course:</span> {selected.exam?.name} (
                {selected.exam?.code || "—"})
              </p>
              <p>
                <span className="text-gray-500">When:</span> {selected.examDate} ·{" "}
                {selected.session} · {selected.exam?.time || "—"}
              </p>
              <p>
                <span className="text-gray-500">Venue:</span> {selected.venue?.name}
              </p>
              <p>
                <span className="text-gray-500">Reason:</span> {selected.reason}
              </p>
              <p>
                <span className="text-gray-500">Requested At:</span> {formatWhen(selected.requestedAt)}
              </p>
              {selected.approvedAt && (
                <p>
                  <span className="text-gray-500">Approved At:</span>{" "}
                  {formatWhen(selected.approvedAt)}
                </p>
              )}
              {selected.rejectedAt && (
                <p>
                  <span className="text-gray-500">Rejected At:</span>{" "}
                  {formatWhen(selected.rejectedAt)}
                </p>
              )}
              {selected.cancelledAt && (
                <p>
                  <span className="text-gray-500">Cancelled At:</span>{" "}
                  {formatWhen(selected.cancelledAt)}
                </p>
              )}
              {selected.rejectionReason && (
                <p className="text-red-700">
                  <span className="text-gray-500">Rejection:</span> {selected.rejectionReason}
                </p>
              )}
            </div>
            {selected.status === "Pending" && (
              <button
                type="button"
                onClick={() => handleCancel(selected.uuid)}
                className="w-full py-2 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50"
              >
                Cancel Request (Override)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
