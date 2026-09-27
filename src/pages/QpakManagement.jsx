import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";
import {
  DocumentTextIcon,
  PlusIcon,
  TrashIcon,
  EyeIcon,
  ArrowUpTrayIcon,
} from "@heroicons/react/24/outline";

const EMPTY_FORM = {
  department: "",
  courseCode: "",
  courseName: "",
  examType: "CAT1",
  academicYear: String(new Date().getFullYear()),
  semester: "",
  batch: "",
  publish: true,
};

const apiBase = import.meta.env.VITE_API_URL?.trim() || "/api";

function fileUrl(docUuid, fileUuid, download = false) {
  const base = `${apiBase}/qpak/${docUuid}/files/${fileUuid}`;
  return download ? `${base}?download=1` : base;
}

function isPdfFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  return type === "application/pdf" || name.endsWith(".pdf");
}

function summarizeFolder(fileList) {
  const all = Array.from(fileList || []);
  const pdfs = all.filter(isPdfFile);
  const folderName =
    pdfs[0]?.webkitRelativePath?.split(/[/\\]/)[0] ||
    all[0]?.webkitRelativePath?.split(/[/\\]/)[0] ||
    (pdfs.length ? "Selected folder" : "");
  return { pdfs, pdfCount: pdfs.length, folderName, totalCount: all.length };
}

export default function QpakManagement() {
  const toast = useToast();
  const showConfirm = useConfirm();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [folderFiles, setFolderFiles] = useState([]);
  const [folderInfo, setFolderInfo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const userRole = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem("user") || "{}")?.role || "";
    } catch {
      return "";
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      const res = await api.get("/qpak", { params });
      setDocuments(res.data?.data?.documents ?? res.data?.documents ?? []);
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Load failed"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFolderFiles([]);
    setFolderInfo(null);
    setShowForm(true);
  };

  const openEdit = (doc) => {
    setEditing(doc);
    setForm({
      department: doc.department || "",
      courseCode: doc.courseCode || "",
      courseName: doc.courseName || "",
      examType: doc.examType || "CAT1",
      academicYear: doc.academicYear || "",
      semester: doc.semester || "",
      batch: doc.batch || "",
      publish: doc.status === "PUBLISHED",
    });
    setFolderFiles([]);
    setFolderInfo(null);
    setShowForm(true);
  };

  const handleFolderPick = (e) => {
    const summary = summarizeFolder(e.target.files);
    setFolderFiles(summary.pdfs);
    setFolderInfo(summary);
    if (!summary.pdfCount) {
      toast.warning("No PDF files found in the selected folder.");
    }
  };

  const buildFormData = () => {
    const fd = new FormData();
    fd.append("department", form.department.trim());
    fd.append("courseCode", form.courseCode.trim());
    fd.append("courseName", form.courseName.trim());
    fd.append("examType", form.examType);
    fd.append("academicYear", form.academicYear.trim());
    fd.append("semester", form.semester.trim());
    fd.append("batch", form.batch.trim());
    fd.append("status", form.publish ? "PUBLISHED" : "DRAFT");
    if (form.publish) fd.append("publish", "PUBLISHED");
    if (folderInfo?.folderName) fd.append("folderName", folderInfo.folderName);
    for (const file of folderFiles) {
      const rel = file.webkitRelativePath || file.name;
      fd.append("folder", file, rel);
    }
    return fd;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editing && !folderFiles.length) {
      toast.warning("Select a folder with PDF files to upload.");
      return;
    }
    setSaving(true);
    try {
      const fd = buildFormData();
      if (editing) {
        await api.put(`/qpak/${editing.uuid}`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        toast.success("QPAK document updated.");
      } else {
        await api.post("/qpak", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        toast.success("QPAK folder uploaded.");
      }
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (doc, publish) => {
    try {
      await api.post(`/qpak/${doc.uuid}/${publish ? "publish" : "unpublish"}`);
      toast.success(publish ? "Published." : "Unpublished.");
      load();
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Update failed"));
    }
  };

  const handleDelete = async (doc) => {
    const ok = await showConfirm(`Delete QPAK document for ${doc.courseCode}?`);
    if (!ok) return;
    try {
      await api.delete(`/qpak/${doc.uuid}`);
      toast.success("Document deleted.");
      load();
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Delete failed"));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
              <DocumentTextIcon className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">QPAK Management</h1>
              <p className="text-sm text-gray-500 mt-1">
                Upload course folders and manage published documents.
                {userRole === "admin" ? " Admin can manage all uploads." : " Showing your uploads only."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700"
          >
            <PlusIcon className="h-4 w-4" />
            Upload Folder
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b flex flex-wrap gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search course, department…"
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl w-56"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl"
            >
              <option value="">All statuses</option>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
            </select>
            <a
              href="/QPAK"
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 rounded-xl"
            >
              Open public /QPAK
            </a>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
            </div>
          ) : documents.length === 0 ? (
            <p className="p-10 text-center text-gray-500">No QPAK uploads yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <th className="text-left px-4 py-3">Course</th>
                    <th className="text-left px-4 py-3">Exam</th>
                    <th className="text-left px-4 py-3">Year / Sem</th>
                    <th className="text-left px-4 py-3">Folder</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {documents.map((doc) => (
                    <tr key={doc.uuid} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{doc.courseName}</div>
                        <div className="text-xs text-gray-500">
                          {doc.courseCode} · {doc.department}
                        </div>
                        {userRole === "admin" && doc.uploaderName && (
                          <div className="text-xs text-gray-400 mt-0.5">by {doc.uploaderName}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">{doc.examType}</td>
                      <td className="px-4 py-3">
                        {doc.academicYear}
                        <div className="text-xs text-gray-500">
                          Sem {doc.semester} · {doc.batch}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium text-gray-800">
                          {doc.folderName || "Folder"}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {doc.fileCount ?? doc.files?.length ?? 0} PDF(s)
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1 max-w-[220px]">
                          {(doc.files || []).slice(0, 4).map((f) => (
                            <a
                              key={f.uuid}
                              href={fileUrl(doc.uuid, f.uuid)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-indigo-600 hover:underline truncate max-w-full"
                              title={f.relativePath || f.originalName}
                            >
                              {f.originalName}
                            </a>
                          ))}
                          {(doc.files || []).length > 4 && (
                            <span className="text-[11px] text-gray-400">
                              +{(doc.files || []).length - 4} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full border ${
                            doc.status === "PUBLISHED"
                              ? "bg-green-50 text-green-800 border-green-200"
                              : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                        >
                          {doc.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(doc)}
                            className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                            title="Edit"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>
                          {doc.status === "PUBLISHED" ? (
                            <button
                              type="button"
                              onClick={() => handlePublish(doc, false)}
                              className="px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 rounded-lg"
                            >
                              Unpublish
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handlePublish(doc, true)}
                              className="px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 rounded-lg"
                            >
                              Publish
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(doc)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                            title="Delete"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold text-gray-900">
                {editing ? "Edit QPAK Document" : "Upload Folder"}
              </h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 text-sm">
                Close
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3">
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
                  <span className="text-gray-600">Exam Type</span>
                  <select
                    value={form.examType}
                    onChange={(e) => setForm({ ...form, examType: e.target.value })}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="CAT1">CAT1</option>
                    <option value="CAT2">CAT2</option>
                    <option value="SEM">SEM</option>
                  </select>
                </label>
                <label className="text-sm col-span-2">
                  <span className="text-gray-600">Course Code</span>
                  <input
                    required
                    value={form.courseCode}
                    onChange={(e) => setForm({ ...form, courseCode: e.target.value })}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="24BCS101"
                  />
                </label>
                <label className="text-sm col-span-2">
                  <span className="text-gray-600">Course Name</span>
                  <input
                    required
                    value={form.courseName}
                    onChange={(e) => setForm({ ...form, courseName: e.target.value })}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="Data Structures"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-gray-600">Academic Year</span>
                  <input
                    required
                    value={form.academicYear}
                    onChange={(e) => setForm({ ...form, academicYear: e.target.value })}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="2026"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-gray-600">Semester</span>
                  <input
                    required
                    value={form.semester}
                    onChange={(e) => setForm({ ...form, semester: e.target.value })}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="5"
                  />
                </label>
                <label className="text-sm col-span-2">
                  <span className="text-gray-600">Batch</span>
                  <input
                    required
                    value={form.batch}
                    onChange={(e) => setForm({ ...form, batch: e.target.value })}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="2024-2028"
                  />
                </label>
              </div>

              <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4 space-y-2">
                <label className="block text-sm font-medium text-gray-800">
                  Upload folder
                </label>
                <p className="text-xs text-gray-500">
                  Select a folder. All PDF files inside are stored as-is — no renaming or detection.
                  {editing ? " Leave empty to keep the current folder." : ""}
                </p>
                <input
                  type="file"
                  webkitdirectory=""
                  directory=""
                  multiple
                  onChange={handleFolderPick}
                  className="mt-1 block w-full text-sm"
                />
                {folderInfo?.folderName ? (
                  <div className="text-xs text-gray-700 space-y-1">
                    <p>
                      Folder: <span className="font-medium">{folderInfo.folderName}</span> ·{" "}
                      {folderInfo.pdfCount} PDF(s)
                    </p>
                    <ul className="max-h-28 overflow-y-auto space-y-0.5 text-slate-600">
                      {folderFiles.slice(0, 12).map((f) => (
                        <li key={f.webkitRelativePath || f.name} className="truncate">
                          {f.webkitRelativePath || f.name}
                        </li>
                      ))}
                      {folderFiles.length > 12 && (
                        <li className="text-gray-400">+{folderFiles.length - 12} more</li>
                      )}
                    </ul>
                  </div>
                ) : editing?.folderName ? (
                  <p className="text-xs text-gray-600">
                    Current folder: <span className="font-medium">{editing.folderName}</span> ·{" "}
                    {editing.fileCount ?? editing.files?.length ?? 0} PDF(s)
                  </p>
                ) : null}
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.publish}
                  onChange={(e) => setForm({ ...form, publish: e.target.checked })}
                />
                Publish immediately (visible on /QPAK)
              </label>

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
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
                >
                  <ArrowUpTrayIcon className="h-4 w-4" />
                  {saving ? "Saving…" : editing ? "Save Changes" : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
