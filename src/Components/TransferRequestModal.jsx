import React, { useCallback, useEffect, useState } from "react";
import api from "../lib/api";
import { XMarkIcon, CheckCircleIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";

function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export default function TransferRequestModal({ exam, onClose, onSuccess }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [lookup, setLookup] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const debouncedEmail = useDebounce(email.trim().toLowerCase(), 450);

  const runLookup = useCallback(async (value) => {
    if (!value || !value.includes("@")) {
      setLookup(null);
      setAvailability(null);
      return;
    }
    setChecking(true);
    setError("");
    try {
      const [searchRes, availRes] = await Promise.all([
        api.get("/faculty-transfers/search-faculty", { params: { email: value } }),
        exam?.uuid
          ? api.get("/faculty-transfers/check-availability", {
              params: { assignmentUuid: exam.uuid, email: value },
            })
          : Promise.resolve(null),
      ]);
      setLookup(searchRes.data?.data ?? searchRes.data);
      if (availRes) {
        setAvailability(availRes.data?.data ?? availRes.data);
      }
    } catch (err) {
      setLookup(null);
      setAvailability(null);
      setError(err.response?.data?.message || err.message || "Lookup failed");
    } finally {
      setChecking(false);
    }
  }, [exam?.uuid]);

  useEffect(() => {
    if (debouncedEmail.endsWith("@kct.ac.in") && debouncedEmail.length > 12) {
      runLookup(debouncedEmail);
    } else {
      setLookup(null);
      setAvailability(null);
    }
  }, [debouncedEmail, runLookup]);

  const facultyExists = lookup?.exists === true;
  const facultyMissing = lookup?.valid && lookup?.exists === false;
  const canSubmit =
    reason.trim().length >= 5 &&
    debouncedEmail.endsWith("@kct.ac.in") &&
    (!facultyMissing || name.trim().length >= 2) &&
    (facultyMissing || availability?.available === true) &&
    !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      await api.post("/faculty-transfers", {
        assignmentUuid: exam.uuid,
        requestedEmail: debouncedEmail,
        requestedName: facultyMissing ? name.trim() : undefined,
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
          <h2 className="text-lg font-bold text-gray-900">Request Transfer</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-gray-500">Exam</span>
                <p className="font-medium text-gray-900">{exam.examName}</p>
              </div>
              <div>
                <span className="text-gray-500">Venue</span>
                <p className="font-medium text-gray-900">{exam.venueName}</p>
              </div>
              <div>
                <span className="text-gray-500">Session</span>
                <p className="font-medium text-gray-900">{exam.examSession}</p>
              </div>
              <div>
                <span className="text-gray-500">Date</span>
                <p className="font-medium text-gray-900">{exam.examDate}</p>
              </div>
            </div>
            <div>
              <span className="text-gray-500">Assigned Time</span>
              <p className="font-medium text-gray-900">{exam.examTime || "—"}</p>
            </div>
            <div>
              <span className="text-gray-500">Current Faculty</span>
              <p className="font-medium text-gray-900">{exam.facultyName}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Replacement Faculty Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@kct.ac.in"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            {checking && <p className="text-xs text-gray-400 mt-1">Checking faculty…</p>}
          </div>

          {facultyExists && lookup?.faculty && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-sm">
              <p className="font-semibold text-indigo-900">{lookup.faculty.name}</p>
              <p className="text-indigo-700">{lookup.faculty.department || "—"}</p>
              <p className="text-indigo-600 text-xs mt-1">{lookup.faculty.email}</p>
            </div>
          )}

          {facultyMissing && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Faculty Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <p className="text-xs text-amber-700 mt-1">
                Email not found in faculty list. Admin will create the account on approval.
              </p>
            </div>
          )}

          {availability && facultyExists && (
            <div
              className={`flex items-start gap-2 rounded-xl p-3 text-sm ${
                availability.available
                  ? "bg-green-50 border border-green-200 text-green-800"
                  : "bg-red-50 border border-red-200 text-red-800"
              }`}
            >
              {availability.available ? (
                <CheckCircleIcon className="h-5 w-5 shrink-0" />
              ) : (
                <ExclamationCircleIcon className="h-5 w-5 shrink-0" />
              )}
              <span>{availability.message}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for Transfer <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Transfer requests can only be submitted until 20 minutes before exam start.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Explain why you need a replacement…"
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
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
