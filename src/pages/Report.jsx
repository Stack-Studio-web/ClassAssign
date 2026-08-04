import React, { useState, useEffect, useRef } from "react";
import api from "../lib/api";
import { useNavigate } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";
import {
  BuildingOffice2Icon,
  ClipboardDocumentListIcon,
  PrinterIcon,
  DocumentTextIcon,
  CalendarIcon,
  UserIcon,
  MapPinIcon,
  TrashIcon,
  CheckCircleIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";
import PrintLayout from "./PrintLayout";
import FacultySchedule from '../Components/FacultySchedule.jsx';
import {
  sendInvigilationNotifications,
  fetchInvigilationBatchStatus,
} from "../lib/invigilationNotificationApi";

const appendClonedContent = (targetDoc, elementId) => {
  const source = document.getElementById(elementId);
  if (!source) return;
  const wrapper = targetDoc.createElement("div");
  wrapper.appendChild(source.cloneNode(true));
  targetDoc.body.appendChild(wrapper);
};

const Report = () => {
  const toast = useToast();
  const showConfirm = useConfirm();
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedPlans, setSelectedPlans] = useState([]);
  const [showFacultySchedule, setShowFacultySchedule] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allFaculty, setAllFaculty] = useState([]);
  const [userRole, setUserRole] = useState("");
  const [deletingPlanId, setDeletingPlanId] = useState(null);
  const [markingCompleted, setMarkingCompleted] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyProgress, setNotifyProgress] = useState(null);
  const notifyPollRef = useRef(null);
  const componentRef = useRef();
  const navigate = useNavigate();

  useEffect(() => {
    return () => {
      if (notifyPollRef.current) clearInterval(notifyPollRef.current);
    };
  }, []);

  // Fetch initial data and role on mount
  useEffect(() => {
    // ✅ 3. Identify user role from session storage
    const userStr = sessionStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserRole(user.role);
      } catch (e) {
        console.error("Auth parse error", e);
      }
    }
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      // ✅ 4. Use 'api' instance instead of raw 'axios' to fix 401 Unauthorized
      const [plansRes, facultyRes] = await Promise.all([
        api.get("/seating", { params: { status: "active" } }),
        api.get("/faculty")
      ]);
      setPlans(Array.isArray(plansRes.data) ? plansRes.data : []);
      setAllFaculty(Array.isArray(facultyRes.data) ? facultyRes.data : []);
      setSelectedPlans([]);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch data:", err);
      if (err.response?.status === 401) {
        navigate("/login"); // Redirect if unauthorized
      } else {
        setError("Failed to load data. Please check the server connection.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlan = (plan) => {
    setSelectedPlan(plan);
  };

  const handleGoBack = () => {
    setSelectedPlan(null);
  };

  const handleCheckboxChange = (planId) => {
    setSelectedPlans((prevSelected) =>
      prevSelected.includes(planId)
        ? prevSelected.filter((id) => id !== planId)
        : [...prevSelected, planId]
    );
  };

  const handlePrintFacultySchedule = () => {
    if (selectedPlans.length === 0) {
      toast.warning("Please select at least one plan to generate the faculty schedule.");
      return;
    }
    setShowFacultySchedule(true);
  };

  const handlePrintSelected = () => {
    const plansToPrint = plans.filter((p) => selectedPlans.includes(p.uuid));
    if (plansToPrint.length === 0) {
      toast.warning("Please select at least one plan to print.");
      return;
    }

    const printWindow = window.open("", "", "height=700,width=900");
    printWindow.document.write("<html><head><title>Seating Plans</title>");
    printWindow.document.write(`
      <style>
        body { font-family: "Times New Roman", serif; margin: 15px; }
        h2, h3 { text-align: center; }
        table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 15px; }
        th, td { border: 1px solid black; padding: 5px 6px; text-align: center; }
        .plan-section { page-break-after: always; margin-bottom: 30px; }
        .plan-section:last-child { page-break-after: auto; }
        @page { size: A4; margin: 12mm; }
      </style>
    `);
    printWindow.document.write("</head><body>");
    plansToPrint.forEach((plan, index) => {
      const planId = plan.uuid;
      printWindow.document.write(`<div class="plan-section"><h2>Seating Plan ${index + 1}</h2><div id="slot-${planId}"></div></div>`);
      appendClonedContent(printWindow.document, `plan-content-${planId}`);
    });
    printWindow.document.write("</body></html>");
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleDeletePlan = async (planId) => {
    const ok = await showConfirm("Are you sure you want to delete this seating plan?");
    if (!ok) return;
    setDeletingPlanId(planId);
    try {
      await api.delete(`/seating/delete-plan/${planId}`);
      toast.success("Seating plan deleted successfully.");
      fetchPlans();
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Cannot delete seating plan"));
    } finally {
      setDeletingPlanId(null);
    }
  };

  const pollNotificationBatch = (batchUuid) => {
    if (notifyPollRef.current) clearInterval(notifyPollRef.current);
    const tick = async () => {
      try {
        const data = await fetchInvigilationBatchStatus(batchUuid);
        setNotifyProgress(data);
        if (data?.batch?.status === "COMPLETED" || data?.batch?.status === "FAILED") {
          clearInterval(notifyPollRef.current);
          notifyPollRef.current = null;
          setNotifyBusy(false);
          const s = data.summary || {};
          toast.success(
            `Sent ${s.emailsSentSuccessfully ?? 0} / ${s.totalFaculty ?? 0} emails` +
              (s.failedEmails ? ` · ${s.failedEmails} failed` : "") +
              (s.facultyWithoutEmailIds ? ` · ${s.facultyWithoutEmailIds} without email` : ""),
            "Invigilation notifications"
          );
        }
      } catch (err) {
        clearInterval(notifyPollRef.current);
        notifyPollRef.current = null;
        setNotifyBusy(false);
        toast.error(getApiError(err), "Notification status");
      }
    };
    tick();
    notifyPollRef.current = setInterval(tick, 1500);
  };

  const handleSendNotification = async (resend = false) => {
    if (selectedPlans.length === 0) {
      toast.warning("Please select at least one seating plan.");
      return;
    }
    const ok = await showConfirm(
      resend
        ? `Resend invigilation emails for ${selectedPlans.length} selected plan(s)? Previously notified faculty will receive another email.`
        : `Send invigilation duty emails to all allotted faculty for ${selectedPlans.length} selected plan(s)?`
    );
    if (!ok) return;

    setNotifyBusy(true);
    setNotifyProgress(null);
    try {
      const result = await sendInvigilationNotifications({
        seatingPlanUuids: selectedPlans,
        resend,
      });
      if (!result?.batchUuid) {
        setNotifyBusy(false);
        toast.error("No batch id returned from server.");
        return;
      }
      pollNotificationBatch(result.batchUuid);
    } catch (err) {
      setNotifyBusy(false);
      toast.error(getApiError(err), getApiErrorTitle(err, "Cannot send notifications"));
    }
  };

  const handleMarkCompleted = async () => {
    if (selectedPlans.length === 0) {
      toast.warning("Please select at least one report to mark as completed.");
      return;
    }
    const ok = await showConfirm(
      `Mark ${selectedPlans.length} selected report(s) as completed? They will move to Completed Reports.`
    );
    if (!ok) return;
    setMarkingCompleted(true);
    try {
      const res = await api.post("/seating/mark-completed", { uuids: selectedPlans });
      const updated = res.data?.data?.updated ?? res.data?.updated ?? selectedPlans.length;
      toast.success(`${updated} report(s) marked as completed.`);
      navigate("/report/completed");
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Cannot mark completed"));
    } finally {
      setMarkingCompleted(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "—";
    const options = { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" };
    return date.toLocaleDateString(undefined, options);
  };

  const handlePrintSingle = () => {
    if (componentRef.current) {
      const printWindow = window.open("", "", "height=600,width=800");
      printWindow.document.write("<html><head><title>Seating Plan</title><style>body { font-family: Arial; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid black; padding: 10px; }</style></head><body></body></html>");
      printWindow.document.close();
      printWindow.document.body.appendChild(componentRef.current.cloneNode(true));
      printWindow.print();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <p className="text-gray-500">Loading saved plans...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (selectedPlan) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 md:px-8 py-6">
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={handleGoBack}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium transition-colors"
          >
            ← Go Back
          </button>
          <button
            onClick={handlePrintSingle}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium transition-colors shadow-sm"
          >
            <PrinterIcon className="h-5 w-5" />
            Print This Plan
          </button>
        </div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-800 mb-4">Seating Plan Details</h2>
        <div ref={componentRef} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <PrintLayout selectedPlan={selectedPlan} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      {/* Header */}
      <div className="px-4 md:px-8 py-4 md:py-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Active Reports</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Select plans to print, or mark as completed after the exam.
            </p>
          </div>
          <Link
            to="/report/completed"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50"
          >
            <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
            Completed Reports
          </Link>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-4 md:px-8 mb-6 flex flex-wrap gap-3">
        <button
          onClick={() => navigate("/Hall")}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium shadow-sm transition-all duration-200"
        >
          <BuildingOffice2Icon className="h-5 w-5" />
          Hall View
        </button>
        <button
          onClick={() => navigate("/attendance/sheets")}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium shadow-sm transition-all duration-200"
        >
          <ClipboardDocumentListIcon className="h-5 w-5" />
          Attendance
        </button>
        {selectedPlans.length > 0 && (
          <>
            <button
              onClick={handlePrintSelected}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm transition-all duration-200"
            >
              <PrinterIcon className="h-5 w-5" />
              Print Selected ({selectedPlans.length})
            </button>
            <button
              onClick={handlePrintFacultySchedule}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium shadow-sm transition-all duration-200"
            >
              <DocumentTextIcon className="h-5 w-5" />
              Faculty Schedule PDF
            </button>
            {(userRole === "admin" || userRole === "faculty_incharge") && (
              <>
                <button
                  onClick={() => handleSendNotification(false)}
                  disabled={notifyBusy}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium shadow-sm transition-all duration-200"
                >
                  <EnvelopeIcon className="h-5 w-5" />
                  {notifyBusy ? "Sending…" : `Send Notification (${selectedPlans.length})`}
                </button>
                <button
                  onClick={() => handleSendNotification(true)}
                  disabled={notifyBusy}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-300 text-indigo-700 bg-white hover:bg-indigo-50 disabled:opacity-50 font-medium shadow-sm transition-all duration-200"
                >
                  Resend Notification
                </button>
                <button
                  onClick={handleMarkCompleted}
                  disabled={markingCompleted}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium shadow-sm transition-all duration-200"
                >
                  <CheckCircleIcon className="h-5 w-5" />
                  {markingCompleted
                    ? "Marking…"
                    : `Mark as Completed (${selectedPlans.length})`}
                </button>
              </>
            )}
          </>
        )}
      </div>

      {notifyProgress && (
        <div className="mx-4 md:mx-8 mb-6 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="font-bold text-indigo-950">Invigilation Email Progress</h3>
            <span className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
              {notifyProgress.batch?.status || "…"}
            </span>
          </div>
          {(notifyBusy || notifyProgress.batch?.status === "PROCESSING") && (
            <div className="mb-3 h-2 rounded-full bg-indigo-100 overflow-hidden">
              <div className="h-full w-1/3 min-w-[30%] animate-pulse bg-indigo-500 rounded-full" />
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="bg-white rounded-xl border border-indigo-100 px-3 py-2">
              <p className="text-xs text-slate-500">Total Faculty</p>
              <p className="text-lg font-bold text-slate-900">
                {notifyProgress.summary?.totalFaculty ?? 0}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-indigo-100 px-3 py-2">
              <p className="text-xs text-slate-500">Emails Sent</p>
              <p className="text-lg font-bold text-emerald-700">
                {notifyProgress.summary?.emailsSentSuccessfully ?? 0}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-indigo-100 px-3 py-2">
              <p className="text-xs text-slate-500">Failed</p>
              <p className="text-lg font-bold text-red-600">
                {notifyProgress.summary?.failedEmails ?? 0}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-indigo-100 px-3 py-2">
              <p className="text-xs text-slate-500">Without Email</p>
              <p className="text-lg font-bold text-amber-600">
                {notifyProgress.summary?.facultyWithoutEmailIds ?? 0}
              </p>
            </div>
          </div>
          {notifyProgress.batch?.errorMessage && (
            <p className="mt-3 text-sm text-red-700">{notifyProgress.batch.errorMessage}</p>
          )}
        </div>
      )}

      {/* Plan Cards */}
      <div className="px-4 md:px-8 pb-8 space-y-4">
        {plans.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">
            No saved seating plans yet.
          </div>
        )}
        {plans.map((plan) => {
          const planId = plan.uuid;
          const venuesText = (plan.venuesUsed || []).map((v) => v.venueName ?? v.venue_name ?? "—").join(", ") || "—";
          return (
            <div
              key={planId}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={selectedPlans.includes(planId)}
                  onChange={() => handleCheckboxChange(planId)}
                  className="mt-1 sm:mt-0 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                />
                <div
                  onClick={() => handleSelectPlan(plan)}
                  className="flex-1 cursor-pointer space-y-2 sm:space-y-1"
                >
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <span className="inline-flex items-center gap-1.5 text-gray-700">
                      <CalendarIcon className="h-4 w-4 text-gray-400 shrink-0" />
                      <strong>Date:</strong> {plan.examDate ? new Date(plan.examDate).toLocaleDateString() : "—"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-gray-700">
                      <UserIcon className="h-4 w-4 text-gray-400 shrink-0" />
                      <strong>Session:</strong> {plan.examSession ?? "—"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-gray-700">
                      <MapPinIcon className="h-4 w-4 text-gray-400 shrink-0" />
                      <strong>Venues:</strong> {venuesText}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-gray-700">
                      <CalendarIcon className="h-4 w-4 text-gray-400 shrink-0" />
                      <strong>Saved on:</strong> {formatDate(plan.createdAt)}
                    </span>
                  </div>
                </div>
              </div>

              <div id={`plan-content-${planId}`} className="hidden">
                <PrintLayout selectedPlan={plan} />
              </div>

              {(userRole === 'admin' || userRole === 'faculty_incharge') && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeletePlan(planId); }}
                  disabled={deletingPlanId === planId}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium shrink-0 transition-colors"
                >
                  <TrashIcon className="h-5 w-5" />
                  {deletingPlanId === planId ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {showFacultySchedule && (
        <FacultySchedule
          plans={plans.filter((p) => selectedPlans.includes(p.uuid))}
          onClose={() => setShowFacultySchedule(false)}
        />
      )}
    </div>
  );
};

export default Report;