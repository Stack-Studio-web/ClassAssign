import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useToast } from "../context/ToastContext";
import { getApiError } from "../lib/errors";
import {
  BeakerIcon,
  PlusIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

const emptySlotForm = { startTime: "09:00", endTime: "11:00" };

export default function LabAllotment() {
  const toast = useToast();
  const [exams, setExams] = useState([]);
  const [selectedUuid, setSelectedUuid] = useState("");
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    department: "",
    examDate: "",
  });
  const [slotForm, setSlotForm] = useState(emptySlotForm);
  const [activeSlotUuid, setActiveSlotUuid] = useState("");
  const [availableVenues, setAvailableVenues] = useState([]);
  const [selectedVenueIds, setSelectedVenueIds] = useState([]);
  const [importFile, setImportFile] = useState(null);
  const [sheetName, setSheetName] = useState("");
  const [preview, setPreview] = useState(null);
  const [students, setStudents] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [rangeForm, setRangeForm] = useState({
    fromRegn: "",
    toRegn: "",
    facultyUuid: "",
  });

  const activeSlot = useMemo(
    () => (detail?.slots || []).find((s) => s.uuid === activeSlotUuid) || null,
    [detail, activeSlotUuid]
  );

  const loadExams = useCallback(async () => {
    const res = await api.get("/lab-exams");
    const list = res.data?.data || res.data || [];
    setExams(Array.isArray(list) ? list : []);
  }, []);

  const loadDetail = useCallback(async (uuid) => {
    if (!uuid) {
      setDetail(null);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get(`/lab-exams/${uuid}`);
      const data = res.data?.data || res.data;
      setDetail(data);
      if (data?.slots?.length) {
        setActiveSlotUuid((prev) =>
          data.slots.some((s) => s.uuid === prev) ? prev : data.slots[0].uuid
        );
      } else {
        setActiveSlotUuid("");
      }
    } catch (err) {
      toast.error(getApiError(err, "Failed to load LAB exam"));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadExams().catch((err) =>
      toast.error(getApiError(err, "Failed to load LAB exams"))
    );
    api
      .get("/faculty")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setFacultyList(list);
      })
      .catch(() => {});
  }, [loadExams, toast]);

  useEffect(() => {
    if (selectedUuid) loadDetail(selectedUuid);
  }, [selectedUuid, loadDetail]);

  useEffect(() => {
    if (!activeSlotUuid) {
      setStudents([]);
      return;
    }
    api
      .get(`/lab-exams/slots/${activeSlotUuid}/students`)
      .then((res) => {
        const list = res.data?.data || res.data || [];
        setStudents(Array.isArray(list) ? list : []);
      })
      .catch(() => setStudents([]));
  }, [activeSlotUuid, detail]);

  const refreshVenuesForSlot = async () => {
    if (!detail?.examDate || !activeSlot) return;
    try {
      const res = await api.get("/lab-exams/venues/available", {
        params: {
          date: detail.examDate,
          startTime: activeSlot.startTime,
          endTime: activeSlot.endTime,
        },
      });
      const payload = res.data?.data || res.data || {};
      const list = Array.isArray(payload)
        ? payload
        : payload.venues || payload.pool || [];
      setAvailableVenues(list);
      setSelectedVenueIds((activeSlot.venues || []).map((v) => v.uuid));
    } catch (err) {
      toast.error(getApiError(err, "Failed to load venues"));
    }
  };

  useEffect(() => {
    refreshVenuesForSlot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlotUuid, detail?.examDate]);

  const handleCreateExam = async () => {
    try {
      setLoading(true);
      const res = await api.post("/lab-exams", createForm);
      const exam = res.data?.data || res.data;
      toast.success("LAB exam created");
      await loadExams();
      setSelectedUuid(exam.uuid);
      setCreateForm({ title: "", department: "", examDate: "" });
    } catch (err) {
      toast.error(getApiError(err, "Create failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleAddSlot = async () => {
    if (!selectedUuid) return;
    try {
      const res = await api.post(`/lab-exams/${selectedUuid}/slots`, slotForm);
      const slot = res.data?.data || res.data;
      toast.success("Slot added");
      setSlotForm(emptySlotForm);
      await loadDetail(selectedUuid);
      setActiveSlotUuid(slot.uuid);
    } catch (err) {
      toast.error(getApiError(err, "Failed to add slot"));
    }
  };

  const handleSaveVenues = async () => {
    if (!activeSlotUuid) return;
    try {
      await api.put(`/lab-exams/slots/${activeSlotUuid}/venues`, {
        venueIds: selectedVenueIds,
      });
      toast.success("Venues saved");
      await loadDetail(selectedUuid);
    } catch (err) {
      toast.error(getApiError(err, "Venue assignment failed"));
    }
  };

  const handlePreviewImport = async () => {
    if (!activeSlotUuid || !importFile) return;
    const fd = new FormData();
    fd.append("file", importFile);
    if (sheetName) fd.append("sheetName", sheetName);
    try {
      const res = await api.post(
        `/lab-exams/slots/${activeSlotUuid}/import/preview`,
        fd
      );
      const data = res.data?.data || res.data;
      setPreview(data);
      if (data?.sheetNames?.length && !sheetName) {
        setSheetName(data.selectedSheet || data.sheetNames[0]);
      }
      toast.success(
        `Preview: ${data?.counts?.valid || 0} valid, ${data?.counts?.invalid || 0} invalid`
      );
    } catch (err) {
      toast.error(getApiError(err, "Preview failed"));
    }
  };

  const handleCommitImport = async () => {
    if (!activeSlotUuid || !importFile) return;
    const fd = new FormData();
    fd.append("file", importFile);
    if (sheetName) fd.append("sheetName", sheetName);
    try {
      const res = await api.post(`/lab-exams/slots/${activeSlotUuid}/import`, fd);
      const data = res.data?.data || res.data;
      setPreview(data.preview || preview);
      setStudents(data.students || []);
      toast.success(res.data?.message || "Students imported");
      await loadDetail(selectedUuid);
    } catch (err) {
      toast.error(getApiError(err, "Import failed"));
    }
  };

  const handleReassign = async (studentUuid, facultyUuid) => {
    try {
      await api.patch(`/lab-exams/students/${studentUuid}/faculty`, {
        facultyUuid,
      });
      toast.success("Faculty updated");
      const res = await api.get(`/lab-exams/slots/${activeSlotUuid}/students`);
      setStudents(res.data?.data || res.data || []);
      await loadDetail(selectedUuid);
    } catch (err) {
      toast.error(getApiError(err, "Reassign failed"));
    }
  };

  const handleAssignRange = async () => {
    try {
      await api.post(`/lab-exams/slots/${activeSlotUuid}/assign-range`, rangeForm);
      toast.success("Range assigned");
      const res = await api.get(`/lab-exams/slots/${activeSlotUuid}/students`);
      setStudents(res.data?.data || res.data || []);
      await loadDetail(selectedUuid);
    } catch (err) {
      toast.error(getApiError(err, "Range assign failed"));
    }
  };

  const handleFinalize = async () => {
    if (!activeSlotUuid) return;
    if (
      !window.confirm(
        "Finalize this slot? This creates attendance assignments for faculty login."
      )
    ) {
      return;
    }
    try {
      setLoading(true);
      await api.post(`/lab-exams/slots/${activeSlotUuid}/finalize`);
      toast.success("Slot finalized — available via /attendance/login");
      await loadDetail(selectedUuid);
      await loadExams();
    } catch (err) {
      toast.error(getApiError(err, "Finalize failed"));
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const res = await api.get("/lab-exams/template", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lab_student_import.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getApiError(err, "Template download failed"));
    }
  };

  const facultyGroups = useMemo(() => {
    const map = new Map();
    for (const s of students) {
      const key = s.facultyEmail || "unassigned";
      if (!map.has(key)) {
        map.set(key, {
          facultyEmail: key,
          facultyName: s.facultyName || "Unresolved",
          facultyUuid: s.facultyUuid,
          students: [],
        });
      }
      map.get(key).students.push(s);
    }
    return [...map.values()];
  }, [students]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <div className="w-full py-4 sm:py-6 space-y-4 sm:space-y-6">
        <div className="flex items-start gap-3">
          <BeakerIcon className="h-8 w-8 text-teal-700 shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">LAB Exam Allotment</h1>
            <p className="text-sm text-gray-600 mt-1">
              Create LAB exams, configure slots, select venues, import students by faculty
              email, and finalize for attendance marking.
            </p>
          </div>
        </div>

        <section className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 sm:p-6 space-y-4">
          <h2 className="text-lg font-semibold">Create LAB exam</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder="LAB exam title"
              value={createForm.title}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, title: e.target.value }))
              }
            />
            <input
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder="Department"
              value={createForm.department}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, department: e.target.value }))
              }
            />
            <input
              type="date"
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
              value={createForm.examDate}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, examDate: e.target.value }))
              }
            />
            <button
              type="button"
              onClick={handleCreateExam}
              disabled={loading || !createForm.title || !createForm.examDate}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 text-white px-4 py-2 text-sm font-semibold disabled:bg-gray-300"
            >
              <PlusIcon className="h-4 w-4" />
              Create
            </button>
          </div>
        </section>

        <section className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <h2 className="text-lg font-semibold">Select LAB exam</h2>
            <select
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm min-w-[240px]"
              value={selectedUuid}
              onChange={(e) => setSelectedUuid(e.target.value)}
            >
              <option value="">— Choose —</option>
              {exams.map((ex) => (
                <option key={ex.uuid} value={ex.uuid}>
                  {ex.title} · {ex.examDate} · {ex.status}
                </option>
              ))}
            </select>
          </div>

          {detail && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-teal-50 text-teal-800 px-3 py-1 font-semibold">
                  Status: {detail.status}
                </span>
                <span className="rounded-full bg-gray-100 text-gray-700 px-3 py-1">
                  {detail.department || "No department"}
                </span>
                <span className="rounded-full bg-gray-100 text-gray-700 px-3 py-1">
                  {detail.examDate}
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="space-y-3 lg:col-span-1">
                  <h3 className="font-semibold text-sm">Slots</h3>
                  <div className="space-y-2">
                    {(detail.slots || []).map((slot) => (
                      <button
                        key={slot.uuid}
                        type="button"
                        onClick={() => setActiveSlotUuid(slot.uuid)}
                        className={`w-full text-left rounded-xl border px-3 py-2 text-sm ${
                          activeSlotUuid === slot.uuid
                            ? "border-teal-600 bg-teal-50"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        <div className="font-medium">
                          Slot {slot.slotIndex}: {slot.startTime}–{slot.endTime}
                        </div>
                        <div className="text-xs text-gray-500">
                          {slot.status} · {slot.studentCount || 0} students ·{" "}
                          {(slot.venues || []).length} venues
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="rounded-xl border border-dashed border-gray-300 p-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-600">Add slot</p>
                    <div className="flex gap-2">
                      <input
                        type="time"
                        className="rounded-lg border px-2 py-1.5 text-sm flex-1"
                        value={slotForm.startTime}
                        onChange={(e) =>
                          setSlotForm((f) => ({ ...f, startTime: e.target.value }))
                        }
                      />
                      <input
                        type="time"
                        className="rounded-lg border px-2 py-1.5 text-sm flex-1"
                        value={slotForm.endTime}
                        onChange={(e) =>
                          setSlotForm((f) => ({ ...f, endTime: e.target.value }))
                        }
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddSlot}
                      className="w-full rounded-lg bg-gray-900 text-white text-sm py-2 font-medium"
                    >
                      Add slot
                    </button>
                  </div>
                </div>

                <div className="space-y-4 lg:col-span-2">
                  {activeSlot ? (
                    <>
                      <div className="rounded-xl border border-gray-200 p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-semibold text-sm">
                            Manual venue selection
                          </h3>
                          <button
                            type="button"
                            onClick={refreshVenuesForSlot}
                            className="text-xs text-teal-700 font-medium"
                          >
                            Refresh availability
                          </button>
                        </div>
                        <div className="max-h-48 overflow-y-auto divide-y border rounded-lg">
                          {availableVenues.length === 0 && (
                            <p className="p-3 text-xs text-gray-500">
                              No venues in the allotment pool for this slot, or availability
                              not loaded.
                            </p>
                          )}
                          {availableVenues.map((v) => {
                            const id = v.uuid || v.id;
                            const checked = selectedVenueIds.includes(id);
                            const unavailable = v.available === false;
                            return (
                              <label
                                key={id}
                                className={`flex items-start gap-2 px-3 py-2 text-sm ${
                                  unavailable ? "opacity-50" : ""
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  disabled={unavailable && !checked}
                                  checked={checked}
                                  onChange={() => {
                                    setSelectedVenueIds((prev) =>
                                      checked
                                        ? prev.filter((x) => x !== id)
                                        : [...prev, id]
                                    );
                                  }}
                                />
                                <span>
                                  <span className="font-medium">{v.name}</span>
                                  <span className="block text-[11px] text-gray-500">
                                    {[v.blockName || v.block, v.department, v.capacity != null ? `Cap ${v.capacity}` : null]
                                      .filter(Boolean)
                                      .join(" · ")}
                                    {unavailable ? " · Occupied" : ""}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveVenues}
                          disabled={activeSlot.status === "finalized"}
                          className="rounded-lg bg-teal-700 text-white text-sm px-3 py-2 font-semibold disabled:bg-gray-300"
                        >
                          Save venues for slot
                        </button>
                      </div>

                      <div className="rounded-xl border border-gray-200 p-3 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-semibold text-sm">
                            Slot-wise Excel import
                          </h3>
                          <button
                            type="button"
                            onClick={downloadTemplate}
                            className="text-xs text-teal-700 font-medium"
                          >
                            Download template
                          </button>
                        </div>
                        <p className="text-xs text-gray-500">
                          Columns: Register Number, Course-1, Email ID
                        </p>
                        <input
                          type="file"
                          accept=".xlsx,.xls"
                          onChange={(e) => {
                            setImportFile(e.target.files?.[0] || null);
                            setPreview(null);
                          }}
                        />
                        {preview?.sheetNames?.length > 1 && (
                          <select
                            className="rounded-lg border px-2 py-1.5 text-sm"
                            value={sheetName}
                            onChange={(e) => setSheetName(e.target.value)}
                          >
                            {preview.sheetNames.map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handlePreviewImport}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium"
                          >
                            <ArrowUpTrayIcon className="h-4 w-4" />
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={handleCommitImport}
                            disabled={activeSlot.status === "finalized"}
                            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-semibold disabled:bg-gray-300"
                          >
                            Import & save
                          </button>
                        </div>
                        {preview && (
                          <div className="text-xs space-y-2">
                            <p>
                              Valid: {preview.counts?.valid ?? 0} · Invalid:{" "}
                              {preview.counts?.invalid ?? 0}
                            </p>
                            {(preview.invalid || []).length > 0 && (
                              <ul className="max-h-32 overflow-y-auto rounded-lg bg-red-50 text-red-800 p-2 space-y-1">
                                {preview.invalid.slice(0, 30).map((row, i) => (
                                  <li key={`inv-${i}`}>
                                    Row {row.importRow}: {row.regnNo || "—"} — {row.reason}
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="rounded-lg bg-gray-50 p-2">
                              <p className="font-semibold mb-1">Faculty counts</p>
                              {(preview.facultySummary || []).map((g) => (
                                <div key={g.facultyEmail}>
                                  {g.facultyName || g.facultyEmail}: {g.studentCount}{" "}
                                  students
                                  {!g.matched ? " (unmatched)" : ""}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border border-gray-200 p-3 space-y-3">
                        <h3 className="font-semibold text-sm">
                          Faculty assignment by email mapping
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {facultyGroups.map((g) => (
                            <div
                              key={g.facultyEmail}
                              className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm"
                            >
                              <p className="font-semibold">
                                {g.facultyName}{" "}
                                <span className="text-gray-500 font-normal">
                                  ({g.facultyEmail})
                                </span>
                              </p>
                              <p className="text-xs text-gray-600 mt-0.5">
                                {g.students.length} students
                              </p>
                              <p className="text-[11px] text-gray-500 mt-1 break-all">
                                {g.students.map((s) => s.regnNo).join(", ")}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="rounded-lg border border-dashed p-3 space-y-2">
                          <p className="text-xs font-semibold text-gray-600">
                            Assign by register range (ordered list)
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                            <input
                              className="rounded-lg border px-2 py-1.5 text-sm"
                              placeholder="From regn"
                              value={rangeForm.fromRegn}
                              onChange={(e) =>
                                setRangeForm((f) => ({
                                  ...f,
                                  fromRegn: e.target.value,
                                }))
                              }
                            />
                            <input
                              className="rounded-lg border px-2 py-1.5 text-sm"
                              placeholder="To regn"
                              value={rangeForm.toRegn}
                              onChange={(e) =>
                                setRangeForm((f) => ({
                                  ...f,
                                  toRegn: e.target.value,
                                }))
                              }
                            />
                            <select
                              className="rounded-lg border px-2 py-1.5 text-sm"
                              value={rangeForm.facultyUuid}
                              onChange={(e) =>
                                setRangeForm((f) => ({
                                  ...f,
                                  facultyUuid: e.target.value,
                                }))
                              }
                            >
                              <option value="">Faculty</option>
                              {facultyList.map((f) => (
                                <option key={f.uuid} value={f.uuid}>
                                  {f.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={handleAssignRange}
                              className="rounded-lg bg-gray-800 text-white text-sm font-medium"
                            >
                              Apply range
                            </button>
                          </div>
                        </div>

                        <div className="max-h-64 overflow-auto border rounded-lg">
                          <table className="min-w-full text-xs">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr>
                                <th className="text-left px-2 py-1.5">Regn</th>
                                <th className="text-left px-2 py-1.5">Course</th>
                                <th className="text-left px-2 py-1.5">Faculty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {students.map((s) => (
                                <tr key={s.uuid} className="border-t">
                                  <td className="px-2 py-1.5 font-medium">{s.regnNo}</td>
                                  <td className="px-2 py-1.5">{s.courseCode}</td>
                                  <td className="px-2 py-1.5">
                                    <select
                                      className="w-full rounded border px-1 py-0.5"
                                      value={s.facultyUuid || ""}
                                      disabled={activeSlot.status === "finalized"}
                                      onChange={(e) =>
                                        handleReassign(s.uuid, e.target.value)
                                      }
                                    >
                                      <option value="">Unresolved</option>
                                      {facultyList.map((f) => (
                                        <option key={f.uuid} value={f.uuid}>
                                          {f.name} ({f.email})
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleFinalize}
                          disabled={
                            loading ||
                            activeSlot.status === "finalized" ||
                            (activeSlot.unresolvedCount || 0) > 0
                          }
                          className="inline-flex items-center gap-2 rounded-xl bg-teal-700 text-white px-4 py-2.5 text-sm font-semibold disabled:bg-gray-300"
                        >
                          <CheckCircleIcon className="h-4 w-4" />
                          Finalize slot for attendance
                        </button>
                        {(activeSlot.unresolvedCount || 0) > 0 && (
                          <p className="text-xs text-amber-700 self-center">
                            Resolve {activeSlot.unresolvedCount} unmatched faculty
                            email(s) before finalize.
                          </p>
                        )}
                        {activeSlot.status === "finalized" && (
                          <p className="text-xs text-green-700 self-center">
                            Finalized. Faculty can mark attendance at /attendance/login
                            during the slot window. Sheets: /attendance/sheets (filter LAB
                            exam type).
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">Add a slot to continue.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
