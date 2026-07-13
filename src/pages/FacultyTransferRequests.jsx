import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  EyeIcon,
  CheckIcon,
  XMarkIcon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/outline";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";

const STATUS_BADGE = {
  Pending: "bg-amber-50 text-amber-800 border-amber-200",
  Approved: "bg-green-50 text-green-800 border-green-200",
  Rejected: "bg-red-50 text-red-800 border-red-200",
};

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${
        STATUS_BADGE[status] || "bg-gray-100 text-gray-700 border-gray-200"
      }`}
    >
      {status === "Pending" && ""}
      {status === "Approved" && ""}
      {status === "Rejected" && ""}
      {status}
    </span>
  );
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
        r.venue?.name,
        r.reason,
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

  const handleApprove = async (uuid) => {
    const ok = await showConfirm(
      "Approve this transfer? The attendance assignment and seating mapping will be updated."
    );
    if (!ok) return;
    setActionLoading(uuid);
    try {
      const res = await api.post(`/faculty-transfers/${uuid}/approve`);
      const data = res.data?.data ?? res.data;
      if (data?.generatedPassword) {
        toast.success(
          `Approved. New faculty login password: ${data.generatedPassword}`,
          "Transfer approved"
        );
      } else if (data?.userAlreadyExisted) {
        toast.success(
          "Transfer approved. Existing user account was linked to a new faculty profile.",
          "Transfer approved"
        );
      } else if (data?.newFacultyCreated) {
        toast.success("Transfer approved. New faculty profile created.", "Transfer approved");
      } else {
        toast.success("Transfer request approved.");
      }
      setSelected(null);
      load();
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Approval failed"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (uuid) => {
    const reason = window.prompt("Rejection reason (required):");
    if (!reason?.trim()) {
      toast.warning("Rejection reason is required.");
      return;
    }
    setActionLoading(uuid);
    try {
      await api.post(`/faculty-transfers/${uuid}/reject`, { reason: reason.trim() });
      toast.success("Transfer request rejected.");
      setSelected(null);
      load();
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Rejection failed"));
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
            <ArrowsRightLeftIcon className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Faculty Change Requests</h1>
            <p className="text-sm text-gray-500 mt-1">
              Review and approve faculty attendance transfer requests.
            </p>
          </div>
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
                    <th className="text-left px-5 py-3">Replacement</th>
                    <th className="text-left px-5 py-3">Exam / Venue</th>
                    <th className="text-left px-5 py-3">Date</th>
                    <th className="text-left px-5 py-3">Reason</th>
                    <th className="text-left px-5 py-3">Status</th>
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
                        <div>{r.exam?.name}</div>
                        <div className="text-xs text-gray-500">{r.venue?.name}</div>
                      </td>
                      <td className="px-5 py-4 text-gray-600">
                        {r.examDate} · {r.session}
                      </td>
                      <td className="px-5 py-4 text-gray-600 max-w-[180px] truncate" title={r.reason}>
                        {r.reason}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={r.status} />
                      </td>
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
                            <>
                              <button
                                type="button"
                                disabled={actionLoading === r.uuid}
                                onClick={() => handleApprove(r.uuid)}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-40"
                                title="Approve"
                              >
                                <CheckIcon className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                disabled={actionLoading === r.uuid}
                                onClick={() => handleReject(r.uuid)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40"
                                title="Reject"
                              >
                                <XMarkIcon className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="p-10 text-center text-gray-500">No transfer requests found.</p>
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
              <h3 className="text-lg font-bold text-gray-900">Request Details</h3>
              <button type="button" onClick={() => setSelected(null)}>
                <XMarkIcon className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <StatusBadge status={selected.status} />
            <div className="text-sm space-y-2">
              <p>
                <span className="text-gray-500">From:</span> {selected.currentFaculty?.name} (
                {selected.currentFaculty?.email})
              </p>
              <p>
                <span className="text-gray-500">To:</span>{" "}
                {selected.requestedFaculty?.name || "New faculty"} (
                {selected.requestedFaculty?.email})
              </p>
              <p>
                <span className="text-gray-500">Exam:</span> {selected.exam?.name} ·{" "}
                {selected.venue?.name}
              </p>
              <p>
                <span className="text-gray-500">When:</span> {selected.examDate} · {selected.session}
              </p>
              <p>
                <span className="text-gray-500">Reason:</span> {selected.reason}
              </p>
              {selected.rejectionReason && (
                <p className="text-red-700">
                  <span className="text-gray-500">Rejection:</span> {selected.rejectionReason}
                </p>
              )}
            </div>
            {selected.status === "Pending" && (
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleReject(selected.uuid)}
                  className="flex-1 py-2 border border-red-200 text-red-700 rounded-xl text-sm font-medium"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => handleApprove(selected.uuid)}
                  className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold"
                >
                  Approve
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
