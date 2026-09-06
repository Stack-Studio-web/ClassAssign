import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  UserPlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import api from "../lib/api";
import { useToast } from "../context/ToastContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";

function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export default function FacultyChange() {
  const toast = useToast();
  const [assignments, setAssignments] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: "",
    examDate: "",
    session: "",
  });
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState("select"); // select | add
  const [selectedFacultyUuid, setSelectedFacultyUuid] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [lookup, setLookup] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const debouncedEmail = useDebounce(email.trim().toLowerCase(), 450);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.examDate) params.examDate = filters.examDate;
      if (filters.session) params.session = filters.session;
      if (filters.search.trim()) params.search = filters.search.trim();
      const res = await api.get("/faculty-transfers/assignments", { params });
      setAssignments(res.data?.data?.assignments ?? res.data?.assignments ?? []);
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Load failed"));
    } finally {
      setLoading(false);
    }
  }, [filters.examDate, filters.session, filters.search, toast]);

  const loadFaculty = useCallback(async () => {
    try {
      const res = await api.get("/faculty");
      const list = Array.isArray(res.data) ? res.data : res.data?.data ?? [];
      setFacultyList(list.filter((f) => f?.email && f?.isAvailable !== false));
    } catch {
      setFacultyList([]);
    }
  }, []);

  useEffect(() => {
    loadAssignments();
    loadFaculty();
  }, [loadAssignments, loadFaculty]);

  const openChange = (assignment) => {
    setSelected(assignment);
    setMode("select");
    setSelectedFacultyUuid("");
    setEmail("");
    setName("");
    setReason("");
    setLookup(null);
    setAvailability(null);
  };

  const closeChange = () => {
    setSelected(null);
    setSubmitting(false);
  };

  const selectedFaculty = useMemo(
    () => facultyList.find((f) => f.uuid === selectedFacultyUuid) || null,
    [facultyList, selectedFacultyUuid]
  );

  const runLookup = useCallback(
    async (value) => {
      if (!value || !value.includes("@") || !selected?.uuid) {
        setLookup(null);
        setAvailability(null);
        return;
      }
      setChecking(true);
      try {
        const [searchRes, availRes] = await Promise.all([
          api.get("/faculty-transfers/search-faculty", { params: { email: value } }),
          api.get("/faculty-transfers/check-availability", {
            params: { assignmentUuid: selected.uuid, email: value },
          }),
        ]);
        setLookup(searchRes.data?.data ?? searchRes.data);
        setAvailability(availRes.data?.data ?? availRes.data);
      } catch (err) {
        setLookup(null);
        setAvailability(null);
        toast.error(getApiError(err), getApiErrorTitle(err, "Lookup failed"));
      } finally {
        setChecking(false);
      }
    },
    [selected?.uuid, toast]
  );

  useEffect(() => {
    if (mode !== "add") return;
    if (debouncedEmail.endsWith("@kct.ac.in") && debouncedEmail.length > 12) {
      runLookup(debouncedEmail);
    } else {
      setLookup(null);
      setAvailability(null);
    }
  }, [debouncedEmail, mode, runLookup]);

  useEffect(() => {
    if (mode !== "select" || !selectedFaculty?.email || !selected?.uuid) {
      if (mode === "select") {
        setLookup(null);
        setAvailability(null);
      }
      return;
    }
    let cancelled = false;
    (async () => {
      setChecking(true);
      try {
        const availRes = await api.get("/faculty-transfers/check-availability", {
          params: { assignmentUuid: selected.uuid, email: selectedFaculty.email },
        });
        if (!cancelled) {
          setAvailability(availRes.data?.data ?? availRes.data);
          setLookup({
            valid: true,
            exists: true,
            faculty: selectedFaculty,
          });
        }
      } catch {
        if (!cancelled) {
          setAvailability(null);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, selectedFaculty, selected?.uuid]);

  const facultyExists = lookup?.exists === true;
  const facultyMissing = mode === "add" && lookup?.valid && lookup?.exists === false;

  const effectiveEmail =
    mode === "select" ? selectedFaculty?.email?.toLowerCase() || "" : debouncedEmail;

  const canSubmit =
    !!selected?.uuid &&
    !!effectiveEmail &&
    effectiveEmail.endsWith("@kct.ac.in") &&
    (mode === "select" ? !!selectedFacultyUuid : true) &&
    (!facultyMissing || name.trim().length >= 2) &&
    (facultyMissing || availability?.available === true) &&
    !submitting &&
    !checking;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await api.post("/faculty-transfers/admin-change", {
        assignmentUuid: selected.uuid,
        requestedEmail: effectiveEmail,
        requestedName: facultyMissing ? name.trim() : undefined,
        reason: reason.trim() || undefined,
      });
      const data = res.data?.data ?? res.data;
      if (data?.generatedPassword) {
        toast.success(
          `Faculty changed. New login password: ${data.generatedPassword}`,
          "Faculty updated"
        );
      } else if (data?.newFacultyCreated) {
        toast.success("Faculty changed. New faculty profile created.", "Faculty updated");
      } else {
        toast.success("Faculty assignment updated.");
      }
      closeChange();
      loadAssignments();
      loadFaculty();
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Change failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
              <UserPlusIcon className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Change Faculty</h1>
              <p className="text-sm text-gray-500 mt-1">
                Replace assigned faculty on an allotment by selecting an existing faculty or adding
                a new one by email and name.
              </p>
            </div>
          </div>
          <Link
            to="/admin/attendance/transfers"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 hover:bg-gray-50"
          >
            <ArrowsRightLeftIcon className="h-4 w-4" />
            Change Requests
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b flex flex-wrap gap-2">
            <div className="relative">
              <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search faculty, venue, exam…"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl w-56 focus:ring-2 focus:ring-indigo-500 outline-none"
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
            <button
              type="button"
              onClick={loadAssignments}
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
                    <th className="text-left px-5 py-3">Current Faculty</th>
                    <th className="text-left px-5 py-3">Exam / Venue</th>
                    <th className="text-left px-5 py-3">Date &amp; Session</th>
                    <th className="text-left px-5 py-3">Time</th>
                    <th className="text-right px-5 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {assignments.map((a) => (
                    <tr key={a.uuid} className="hover:bg-gray-50/60">
                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-900">{a.facultyName}</div>
                        <div className="text-xs text-gray-500">{a.facultyEmail}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div>{a.examName}</div>
                        <div className="text-xs text-gray-500">{a.venueName}</div>
                      </td>
                      <td className="px-5 py-4 text-gray-600">
                        {a.examDate} · {a.examSession || "—"}
                      </td>
                      <td className="px-5 py-4 text-gray-600">
                        {a.startTime && a.endTime
                          ? `${a.startTime} – ${a.endTime}`
                          : a.examTime || "—"}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openChange(a)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700"
                        >
                          Change Faculty
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {assignments.length === 0 && (
                <p className="p-10 text-center text-gray-500">
                  No unlocked faculty assignments found.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold text-gray-900">Change Faculty</h2>
              <button type="button" onClick={closeChange} className="p-1 rounded-lg hover:bg-gray-100">
                <XMarkIcon className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-gray-500">Exam</span>
                    <p className="font-medium text-gray-900">{selected.examName}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Venue</span>
                    <p className="font-medium text-gray-900">{selected.venueName}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Date</span>
                    <p className="font-medium text-gray-900">{selected.examDate}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Session</span>
                    <p className="font-medium text-gray-900">{selected.examSession || "—"}</p>
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Current Faculty</span>
                  <p className="font-medium text-gray-900">
                    {selected.facultyName} ({selected.facultyEmail})
                  </p>
                </div>
              </div>

              <div className="flex rounded-xl border border-gray-200 overflow-hidden text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMode("select");
                    setEmail("");
                    setName("");
                  }}
                  className={`flex-1 py-2.5 font-medium ${
                    mode === "select"
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Select existing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("add");
                    setSelectedFacultyUuid("");
                  }}
                  className={`flex-1 py-2.5 font-medium ${
                    mode === "add"
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Add by email
                </button>
              </div>

              {mode === "select" ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Replacement Faculty <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedFacultyUuid}
                    onChange={(e) => setSelectedFacultyUuid(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">Select faculty…</option>
                    {facultyList
                      .filter((f) => f.email !== selected.facultyEmail)
                      .map((f) => (
                        <option key={f.uuid} value={f.uuid}>
                          {f.name} — {f.email}
                          {f.department ? ` (${f.department})` : ""}
                        </option>
                      ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Faculty Email <span className="text-red-500">*</span>
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
                        Email not found. A new faculty account will be created on save.
                      </p>
                    </div>
                  )}
                </>
              )}

              {availability && (facultyExists || mode === "select") && (
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

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Faculty changes ignore the normal allocation limit. The replacement is only blocked
                if they already have an overlapping exam at this date/time.
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason (optional)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Why is this faculty being changed?"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeChange}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? "Saving…" : "Update Faculty"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
