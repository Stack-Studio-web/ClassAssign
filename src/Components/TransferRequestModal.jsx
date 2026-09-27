import React, { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { XMarkIcon } from "@heroicons/react/24/outline";

function splitExamTime(examTime) {
  const parts = String(examTime || "")
    .split("-")
    .map((p) => p.trim())
    .filter(Boolean);
  return { start: parts[0] || "—", end: parts[1] || "—" };
}

export default function TransferRequestModal({ exam, currentFacultyName, onClose, onSuccess }) {
  const [eligible, setEligible] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [reason, setReason] = useState("");
  const [loadingFaculty, setLoadingFaculty] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const times = useMemo(() => splitExamTime(exam?.examTime), [exam?.examTime]);
  const selectedFaculty = useMemo(
    () => eligible.find((f) => f.email === selectedEmail) || null,
    [eligible, selectedEmail]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!exam?.uuid) return;
      setLoadingFaculty(true);
      setError("");
      try {
        const res = await api.get("/faculty-transfers/eligible-faculty", {
          params: { assignmentUuid: exam.uuid },
        });
        if (cancelled) return;
        setEligible(res.data?.data?.faculty ?? res.data?.faculty ?? []);
      } catch (err) {
        if (!cancelled) {
          setEligible([]);
          setError(err.response?.data?.message || err.message || "Failed to load eligible faculty");
        }
      } finally {
        if (!cancelled) setLoadingFaculty(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exam?.uuid]);

  const canSubmit =
    !!selectedEmail &&
    reason.trim().length >= 5 &&
    !submitting &&
    !loadingFaculty;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || !selectedFaculty) return;
    setSubmitting(true);
    setError("");
    try {
      await api.post("/faculty-transfers", {
        assignmentUuid: exam.uuid,
        requestedEmail: selectedFaculty.email,
        requestedName: selectedFaculty.name,
        reason: reason.trim(),
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-900">Faculty Change Request</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <div>
              <span className="text-gray-500">Current Faculty</span>
              <p className="font-medium text-gray-900">
                {currentFacultyName || exam.facultyName || "—"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-gray-500">Course Code</span>
                <p className="font-medium text-gray-900">{exam.examCode || "—"}</p>
              </div>
              <div>
                <span className="text-gray-500">Course Name</span>
                <p className="font-medium text-gray-900">{exam.examName || "—"}</p>
              </div>
              <div>
                <span className="text-gray-500">Date</span>
                <p className="font-medium text-gray-900">{exam.examDate || "—"}</p>
              </div>
              <div>
                <span className="text-gray-500">Venue</span>
                <p className="font-medium text-gray-900">{exam.venueName || "—"}</p>
              </div>
              <div>
                <span className="text-gray-500">Start Time</span>
                <p className="font-medium text-gray-900">{times.start}</p>
              </div>
              <div>
                <span className="text-gray-500">End Time</span>
                <p className="font-medium text-gray-900">{times.end}</p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Request To <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedEmail}
              onChange={(e) => setSelectedEmail(e.target.value)}
              disabled={loadingFaculty}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-60"
            >
              <option value="">
                {loadingFaculty ? "Loading eligible faculty…" : "Select faculty"}
              </option>
              {eligible.map((f) => (
                <option key={f.uuid || f.email} value={f.email}>
                  {f.name}
                  {f.department ? ` · ${f.department}` : ""}
                </option>
              ))}
            </select>
            {!loadingFaculty && eligible.length === 0 && (
              <p className="text-xs text-amber-700 mt-1">
                No eligible faculty available for this assignment right now.
              </p>
            )}
            {selectedFaculty && (
              <p className="text-xs text-gray-500 mt-1">{selectedFaculty.email}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Mutual change requests can only be submitted until 20 minutes before exam start.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Requesting mutual faculty change for the assigned examination."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Send Mutual Change Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
