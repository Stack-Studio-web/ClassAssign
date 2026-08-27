import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { logout } from "../lib/api";
import {
  ArrowsRightLeftIcon,
  Bars3Icon,
  CalendarDaysIcon,
  ClockIcon,
  MapPinIcon,
  QuestionMarkCircleIcon,
  UsersIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { getWindowBadge } from "../lib/attendanceWindow";
import TransferRequestModal from "../Components/TransferRequestModal";
import UserAvatar from "../Components/UserAvatar";
import { useToast } from "../context/ToastContext";

function statusMeta(exam) {
  if (exam.isLocked || exam.lifecycleCompleted || exam.lifecycleStatus === "COMPLETED") {
    return {
      label: "COMPLETED",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      banner: "Attendance submitted successfully.",
      bannerClass: "text-emerald-700 bg-emerald-50 border-emerald-200",
    };
  }
  const badge = getWindowBadge(exam.windowStatus);
  if (exam.windowStatus === "PENDING") {
    return {
      label: "PENDING",
      className: "bg-slate-100 text-slate-600 border-slate-200",
      banner: exam.windowMessage || "Attendance has not started yet.",
      bannerClass:
        "text-[#0B1F4B] bg-blue-50 border-blue-100 border-l-4 border-l-[#0B1F4B] sm:text-amber-700 sm:bg-transparent sm:border-0 sm:border-l-0",
    };
  }
  if (exam.windowStatus === "OPEN" || exam.windowStatus === "MANUALLY_UNLOCKED") {
    return {
      label: badge.label.toUpperCase(),
      className: "bg-green-50 text-green-700 border-green-200",
      banner: exam.windowMessage || "Attendance window is open.",
      bannerClass: "text-green-700 bg-green-50 border-green-200",
    };
  }
  if (exam.windowStatus === "LOCKED" || exam.windowStatus === "MANUALLY_LOCKED") {
    return {
      label: "CLOSED",
      className: "bg-red-50 text-red-700 border-red-200",
      banner: exam.windowMessage || "Attendance window has closed.",
      bannerClass: "text-red-700 bg-red-50 border-red-200",
    };
  }
  return {
    label: (badge.label || "UNKNOWN").toUpperCase(),
    className: badge.className,
    banner: exam.windowMessage || null,
    bannerClass: "text-slate-600 bg-slate-50 border-slate-200",
  };
}

export default function FacultyDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [faculty, setFaculty] = useState(null);
  const [exams, setExams] = useState([]);
  const [transferRequests, setTransferRequests] = useState([]);
  const [transferExam, setTransferExam] = useState(null);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const sessionUser = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [examRes, transferRes] = await Promise.all([
          api.get("/faculty-attendance/my-exams"),
          api.get("/faculty-transfers").catch(() => ({ data: {} })),
        ]);
        setFaculty(examRes.data.faculty);
        setExams(examRes.data.exams || []);
        setTransferRequests(
          transferRes.data?.data?.requests ?? transferRes.data?.requests ?? []
        );
      } catch (err) {
        setError(
          err.response?.data?.message ||
            err.response?.data?.error ||
            "Failed to load assigned exams"
        );
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const displayName = faculty?.name || sessionUser?.name || sessionUser?.username || "Faculty";
  const displayEmail = sessionUser?.email || faculty?.email || "";
  const displayDept = faculty?.department || "Faculty";
  const avatarUrl = sessionUser?.hasAvatar
    ? sessionUser?.avatarUrl || "/api/auth/me/avatar"
    : null;

  const getTransferStatus = (examUuid) => {
    const req = transferRequests.find(
      (r) => r.assignmentUuid === examUuid && r.status === "Pending"
    );
    return req?.status || null;
  };

  const handleLogout = () => logout("/attendance/login");

  const openAttendance = (exam) => {
    navigate(`/faculty/attendance/${exam.uuid}`, { state: { exam } });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0B1F4B]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-[Inter,system-ui,sans-serif]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          {/* Mobile menu */}
          <button
            type="button"
            className="sm:hidden p-2 -ml-1 rounded-lg text-[#0B1F4B] hover:bg-slate-100"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
          >
            {menuOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
          </button>

          <p className="font-bold text-[#0B1F4B] text-sm sm:text-base tracking-tight flex-1 sm:flex-none text-center sm:text-left">
            Faculty Attendance Portal
          </p>

          {/* Desktop user cluster */}
          <div className="hidden sm:flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-800 leading-tight">{displayName}</p>
              {displayEmail && (
                <p className="text-xs text-slate-500 leading-tight">{displayEmail}</p>
              )}
            </div>
            <UserAvatar
              name={displayName}
              avatarUrl={avatarUrl}
              size="lg"
              bgClassName="bg-[#0B1F4B]"
            />
            <button
              type="button"
              className="p-2 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Help"
              title="Help"
            >
              <QuestionMarkCircleIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs font-bold tracking-wide text-red-600 hover:text-red-700 px-2"
            >
              LOGOUT
            </button>
          </div>

          {/* Mobile avatar */}
          <UserAvatar
            name={displayName}
            avatarUrl={avatarUrl}
            size="md"
            bgClassName="bg-[#0B1F4B]"
            className="sm:hidden"
          />
        </div>

        {/* Mobile drawer */}
        {menuOpen && (
          <div className="sm:hidden border-t border-slate-100 bg-white px-4 py-3 space-y-3 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-slate-800">{displayName}</p>
              {displayEmail && <p className="text-xs text-slate-500">{displayEmail}</p>}
              <p className="text-xs text-slate-400 mt-0.5">{displayDept}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full text-left text-sm font-bold text-red-600 py-2"
            >
              Logout
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-5 sm:py-8">
        <div className="mb-5 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0B1F4B]">My Exams</h1>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-semibold text-slate-700 uppercase tracking-wide">
              {displayName}
            </span>
            <span className="mx-1.5 text-slate-300">/</span>
            <span className="text-slate-500">{displayDept}</span>
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {exams.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-slate-500">
            No exams assigned yet. Contact the exam cell.
          </div>
        ) : (
          <div className="space-y-4">
            {exams.map((exam) => {
              const meta = statusMeta(exam);
              const canMark = exam.canWrite && !exam.isLocked;
              const pendingTransfer = getTransferStatus(exam.uuid);
              const canRequestTransfer = !exam.isLocked && !pendingTransfer;
              const completed =
                exam.isLocked ||
                exam.lifecycleCompleted ||
                exam.lifecycleStatus === "COMPLETED";
              const primaryLabel = canMark
                ? "Take Attendance"
                : completed
                  ? "View Report"
                  : "View Hall";

              return (
                <article
                  key={exam.uuid}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-5"
                >
                  <div className="flex flex-col lg:flex-row lg:items-stretch gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base sm:text-lg font-bold text-[#0B1F4B] leading-snug">
                          {exam.examName}
                        </h2>
                        <span
                          className={`text-[10px] sm:text-xs px-2 py-0.5 rounded border font-bold tracking-wide ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                      </div>

                      <p className="mt-1 text-xs sm:text-sm text-slate-400 font-medium break-all">
                        {exam.examCode}
                      </p>

                      {/* Desktop meta row */}
                      <div className="mt-3 hidden sm:flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDaysIcon className="h-4 w-4 text-slate-400" />
                          {exam.examDate}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <ClockIcon className="h-4 w-4 text-slate-400" />
                          {exam.examSession}
                          {exam.examTime ? ` · ${exam.examTime}` : ""}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <MapPinIcon className="h-4 w-4 text-slate-400" />
                          {exam.venueName}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <UsersIcon className="h-4 w-4 text-slate-400" />
                          {exam.studentCount} students
                        </span>
                      </div>

                      {/* Mobile meta list */}
                      <ul className="mt-3 sm:hidden space-y-2 text-sm text-slate-600">
                        <li className="flex items-center gap-2">
                          <CalendarDaysIcon className="h-4 w-4 text-slate-400 shrink-0" />
                          {exam.examDate}
                        </li>
                        <li className="flex items-center gap-2">
                          <ClockIcon className="h-4 w-4 text-slate-400 shrink-0" />
                          {exam.examSession}
                          {exam.examTime ? ` · ${exam.examTime}` : ""}
                        </li>
                        <li className="flex items-center gap-2">
                          <MapPinIcon className="h-4 w-4 text-slate-400 shrink-0" />
                          {exam.venueName}
                        </li>
                        <li className="flex items-center gap-2">
                          <UsersIcon className="h-4 w-4 text-slate-400 shrink-0" />
                          {exam.studentCount} students
                        </li>
                      </ul>

                      {meta.banner && (
                        <div
                          className={`mt-3 text-xs sm:text-sm font-medium rounded-lg sm:rounded-none border sm:border-0 px-3 py-2 sm:px-0 sm:py-0 ${meta.bannerClass}`}
                        >
                          {meta.banner}
                        </div>
                      )}

                      {exam.manuallyReopened && (
                        <p className="mt-2 text-xs text-blue-700">
                          Attendance has been manually reopened by administrator.
                        </p>
                      )}
                      {pendingTransfer && (
                        <p className="mt-2 text-xs text-amber-700 font-medium">
                          Transfer request pending approval
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-row lg:flex-col gap-2 shrink-0 lg:justify-center lg:min-w-[150px]">
                      <button
                        type="button"
                        onClick={() => openAttendance(exam)}
                        className={`flex-1 lg:flex-none px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                          canMark
                            ? "bg-[#0B1F4B] text-white hover:bg-[#122a5c]"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {primaryLabel}
                      </button>
                      {canRequestTransfer && (
                        <button
                          type="button"
                          onClick={() => setTransferExam(exam)}
                          className="flex-1 lg:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold border border-blue-300 text-blue-700 bg-white hover:bg-blue-50"
                        >
                          <ArrowsRightLeftIcon className="h-4 w-4" />
                          Request Transfer
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <footer className="mt-auto bg-[#0B1F4B] text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <p className="font-bold tracking-wide">KCT</p>
          <p className="text-center text-white/80">
            © {new Date().getFullYear()} Kumaraguru College of Technology. All Rights Reserved.
          </p>
          <div className="hidden sm:flex gap-4 text-white/70 font-semibold tracking-wide uppercase">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>IT Support</span>
          </div>
        </div>
      </footer>

      {transferExam && (
        <TransferRequestModal
          exam={transferExam}
          onClose={() => setTransferExam(null)}
          onSuccess={() => {
            toast.success("Transfer request submitted. Awaiting admin approval.");
            api.get("/faculty-transfers").then((res) => {
              setTransferRequests(res.data?.data?.requests ?? res.data?.requests ?? []);
            });
          }}
        />
      )}
    </div>
  );
}
