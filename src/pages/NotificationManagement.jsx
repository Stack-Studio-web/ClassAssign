import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowPathIcon,
  BellAlertIcon,
  CheckCircleIcon,
  ClockIcon,
  PauseIcon,
  PlayIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import {
  OFFSET_PRESET_LABELS,
  STATUS_OPTIONS,
  bulkResendNotifications,
  cancelNotification,
  fetchNotificationHistory,
  fetchNotificationStats,
  fetchNotificationSettings,
  pauseNotifications,
  resendNotification,
  resumeNotifications,
  sendNotificationNow,
  updateNotificationSettings,
} from "../lib/hallNotificationApi";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { getApiError } from "../lib/errors";

function StatCard({ label, value, color = "text-gray-900" }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

export default function NotificationManagement() {
  const toast = useToast();
  const showConfirm = useConfirm();
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState(null);
  const [presets, setPresets] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [filters, setFilters] = useState({
    date: "",
    session: "",
    examType: "",
    hall: "",
    department: "",
    status: "",
    search: "",
    page: 1,
  });
  const [settingsForm, setSettingsForm] = useState({
    offsetPreset: "12_hours",
    customOffsetMinutes: 720,
    portalUrl: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, settingsRes, historyRes] = await Promise.all([
        fetchNotificationStats(),
        fetchNotificationSettings(),
        fetchNotificationHistory({ ...filters, limit: 25 }),
      ]);
      setStats(statsRes);
      setSettings(settingsRes.settings);
      setPresets(settingsRes.presets || []);
      setNotifications(historyRes.notifications || []);
      setPagination(historyRes.pagination || { page: 1, totalPages: 1, total: 0 });
      setSettingsForm({
        offsetPreset: settingsRes.settings?.offsetPreset || "12_hours",
        customOffsetMinutes:
          settingsRes.settings?.customOffsetMinutes ||
          settingsRes.settings?.offsetMinutes ||
          720,
        portalUrl: settingsRes.settings?.portalUrl || "",
      });
    } catch (err) {
      toast.error(getApiError(err, "Failed to load notifications"));
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      await updateNotificationSettings(settingsForm);
      toast.success("Notification settings saved.");
      load();
    } catch (err) {
      toast.error(getApiError(err));
    }
  };

  const handlePauseToggle = async () => {
    try {
      if (settings?.notificationsPaused) {
        await resumeNotifications();
        toast.success("Notifications resumed.");
      } else {
        const ok = await showConfirm("Pause all automated hall notifications?");
        if (!ok) return;
        await pauseNotifications();
        toast.success("Notifications paused.");
      }
      load();
    } catch (err) {
      toast.error(getApiError(err));
    }
  };

  const handleAction = async (action, id) => {
    try {
      if (action === "cancel") {
        const ok = await showConfirm("Cancel this scheduled notification?");
        if (!ok) return;
        await cancelNotification(id);
        toast.success("Cancelled.");
      } else if (action === "resend") {
        await resendNotification(id);
        toast.success("Queued for resend.");
      } else if (action === "now") {
        await sendNotificationNow(id);
        toast.success("Sent to queue immediately.");
      }
      load();
    } catch (err) {
      toast.error(getApiError(err));
    }
  };

  const handleBulkResend = async () => {
    if (selected.size === 0) return;
    try {
      const res = await bulkResendNotifications(Array.from(selected));
      toast.success(`Resent ${res.resent} notification(s).`);
      setSelected(new Set());
      load();
    } catch (err) {
      toast.error(getApiError(err));
    }
  };

  const s = stats?.stats || {};
  const q = stats?.queue || {};

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
              <BellAlertIcon className="h-8 w-8 text-indigo-600" />
              Hall Notification Management
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Automated Teams notifications are scheduled when seating plans are finalized.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/Hall"
              className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
            >
              Hall Module
            </Link>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {settings?.notificationsPaused && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
            All automated notifications are <b>paused</b>. Scheduled items will not be sent until resumed.
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="Scheduled" value={s.scheduled ?? 0} color="text-blue-600" />
          <StatCard label="Queued" value={s.queued ?? 0} color="text-indigo-600" />
          <StatCard label="Processing" value={s.processing ?? 0} color="text-yellow-600" />
          <StatCard label="Sent" value={s.sent ?? 0} color="text-green-600" />
          <StatCard label="Delivered" value={s.delivered ?? 0} color="text-emerald-600" />
          <StatCard label="Failed" value={s.failed ?? 0} color="text-red-600" />
          <StatCard label="Retrying" value={s.retrying ?? 0} color="text-orange-600" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Send notification before exam
                </label>
                <select
                  value={settingsForm.offsetPreset}
                  onChange={(e) =>
                    setSettingsForm((f) => ({ ...f, offsetPreset: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  {presets.map((p) => (
                    <option key={p} value={p}>
                      {OFFSET_PRESET_LABELS[p] || p}
                    </option>
                  ))}
                </select>
              </div>
              {settingsForm.offsetPreset === "custom" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Custom offset (minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={settingsForm.customOffsetMinutes}
                    onChange={(e) =>
                      setSettingsForm((f) => ({
                        ...f,
                        customOffsetMinutes: Number(e.target.value),
                      }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Portal link in messages
                </label>
                <input
                  type="url"
                  value={settingsForm.portalUrl}
                  onChange={(e) =>
                    setSettingsForm((f) => ({ ...f, portalUrl: e.target.value }))
                  }
                  placeholder="https://iexam.kumaraguru.in"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700"
              >
                Save Settings
              </button>
            </form>
            <button
              type="button"
              onClick={handlePauseToggle}
              className={`w-full py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 ${
                settings?.notificationsPaused
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : "bg-amber-500 text-white hover:bg-amber-600"
              }`}
            >
              {settings?.notificationsPaused ? (
                <>
                  <PlayIcon className="h-4 w-4" /> Resume All
                </>
              ) : (
                <>
                  <PauseIcon className="h-4 w-4" /> Pause All
                </>
              )}
            </button>
            <div className="pt-3 border-t border-gray-100 text-xs text-gray-500 space-y-1">
              <p className="flex items-center gap-1">
                <ClockIcon className="h-3.5 w-3.5" />
                Queue: {q.waiting ?? 0} waiting · {q.active ?? 0} active
              </p>
              <p>
                Completed: {q.completed ?? 0} · Failed jobs: {q.failed ?? 0}
              </p>
            </div>
          </section>

          <section className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-gray-900">Notification History</h2>
                {selected.size > 0 && (
                  <button
                    type="button"
                    onClick={handleBulkResend}
                    className="text-sm px-3 py-1.5 bg-orange-500 text-white rounded-lg"
                  >
                    Resend selected ({selected.size})
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  type="date"
                  value={filters.date}
                  onChange={(e) => setFilters((f) => ({ ...f, date: e.target.value, page: 1 }))}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                />
                <select
                  value={filters.session}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, session: e.target.value, page: 1 }))
                  }
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="">All Sessions</option>
                  <option value="FN">FN</option>
                  <option value="AN">AN</option>
                </select>
                <select
                  value={filters.status}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))
                  }
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="">All Status</option>
                  {STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Search..."
                  value={filters.search}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))
                  }
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[120px]"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <div className="animate-spin h-10 w-10 border-b-2 border-indigo-600 rounded-full" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs uppercase text-gray-500">
                      <th className="px-3 py-2 w-8" />
                      <th className="text-left px-3 py-2">Recipient</th>
                      <th className="text-left px-3 py-2">Hall</th>
                      <th className="text-left px-3 py-2">Exam</th>
                      <th className="text-left px-3 py-2">Scheduled</th>
                      <th className="text-left px-3 py-2">Status</th>
                      <th className="text-right px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {notifications.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-12 text-center text-gray-500">
                          No notifications yet. Finalize a seating plan to schedule automatically.
                        </td>
                      </tr>
                    ) : (
                      notifications.map((n) => (
                        <tr key={n.id} className="hover:bg-gray-50/60">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selected.has(n.id)}
                              onChange={(e) => {
                                const next = new Set(selected);
                                if (e.target.checked) next.add(n.id);
                                else next.delete(n.id);
                                setSelected(next);
                              }}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{n.recipientName}</div>
                            <div className="text-xs text-gray-500">{n.recipientEmail}</div>
                            <div className="text-xs font-mono text-gray-400">{n.regnNo}</div>
                          </td>
                          <td className="px-3 py-2">{n.hallName || "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {n.examDate} {n.examSession}
                            <div className="text-xs text-gray-500">{n.examType}</div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">
                            {formatDateTime(n.scheduledTime)}
                            {n.sentAt && (
                              <div className="text-green-600">Sent: {formatDateTime(n.sentAt)}</div>
                            )}
                            {n.lastError && (
                              <div className="text-red-600 truncate max-w-[140px]" title={n.lastError}>
                                {n.lastError}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                n.status === "DELIVERED" || n.status === "SENT"
                                  ? "bg-green-100 text-green-700"
                                  : n.status === "FAILED"
                                    ? "bg-red-100 text-red-700"
                                    : n.status === "SCHEDULED"
                                      ? "bg-blue-100 text-blue-700"
                                      : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {n.status}
                            </span>
                            {n.retryCount > 0 && (
                              <div className="text-xs text-gray-400">Retries: {n.retryCount}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right space-x-1 whitespace-nowrap">
                            {["SCHEDULED", "RETRYING", "FAILED"].includes(n.status) && (
                              <button
                                type="button"
                                onClick={() => handleAction("now", n.id)}
                                className="text-indigo-600 text-xs font-semibold"
                              >
                                Send now
                              </button>
                            )}
                            {["FAILED", "CANCELLED", "SENT", "DELIVERED"].includes(n.status) && (
                              <button
                                type="button"
                                onClick={() => handleAction("resend", n.id)}
                                className="text-orange-600 text-xs font-semibold"
                              >
                                Resend
                              </button>
                            )}
                            {["SCHEDULED", "QUEUED", "RETRYING"].includes(n.status) && (
                              <button
                                type="button"
                                onClick={() => handleAction("cancel", n.id)}
                                className="text-red-600 text-xs font-semibold"
                              >
                                Cancel
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {pagination.totalPages > 1 && (
              <div className="flex justify-between items-center px-5 py-3 border-t border-gray-100 text-sm">
                <span>
                  Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pagination.page <= 1}
                    onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                    className="px-3 py-1 border rounded-lg disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                    className="px-3 py-1 border rounded-lg disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800 flex gap-2">
          <CheckCircleIcon className="h-5 w-5 shrink-0" />
          <p>
            Notifications are created automatically when you <b>Save & Finalize</b> a seating plan
            in Allotment. Default send time is <b>12 hours before</b> exam start (configurable above).
            No manual action is required on the Hall page.
          </p>
        </div>
      </div>
    </div>
  );
}
