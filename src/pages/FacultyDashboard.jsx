import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { logout } from "../lib/api";
import { CalendarDaysIcon, MapPinIcon, UsersIcon, ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { getWindowBadge } from "../lib/attendanceWindow";
import TransferRequestModal from "../Components/TransferRequestModal";
import { useToast } from "../context/ToastContext";

export default function FacultyDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [faculty, setFaculty] = useState(null);
  const [exams, setExams] = useState([]);
  const [transferRequests, setTransferRequests] = useState([]);
  const [transferExam, setTransferExam] = useState(null);
  const [error, setError] = useState("");

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
        setError(err.response?.data?.message || err.response?.data?.error || "Failed to load assigned exams");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">My Exams</h1>
            {faculty && (
              <p className="text-sm text-gray-500">
                {faculty.name} · {faculty.department || "Faculty"}
              </p>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-red-600 hover:text-red-700 font-medium"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {exams.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500">
            No exams assigned yet. Contact the exam cell.
          </div>
        ) : (
          <div className="grid gap-4">
            {exams.map((exam) => {
              const badge = getWindowBadge(exam.windowStatus);
              const canMark = exam.canWrite && !exam.isLocked;
              const pendingTransfer = getTransferStatus(exam.uuid);
              const canRequestTransfer = !exam.isLocked && !pendingTransfer;
              return (
                <div
                  key={exam.uuid}
                  className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h2 className="text-lg font-semibold text-gray-900">{exam.examName}</h2>
                        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                        {exam.isLocked && (
                          <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                            Submitted
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{exam.examCode}</p>
                      <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <CalendarDaysIcon className="h-4 w-4" />
                          {exam.examDate} · {exam.examSession} · {exam.examTime}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPinIcon className="h-4 w-4" />
                          {exam.venueName}
                        </span>
                        <span className="flex items-center gap-1">
                          <UsersIcon className="h-4 w-4" />
                          {exam.studentCount} students
                        </span>
                      </div>
                      {exam.windowMessage && exam.windowStatus === "PENDING" && (
                        <p className="mt-2 text-xs text-amber-700">{exam.windowMessage}</p>
                      )}
                      {exam.windowStatus === "LOCKED" && !exam.isLocked && (
                        <p className="mt-2 text-xs text-red-700">Attendance window has closed.</p>
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
                    <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                      <button
                        onClick={() => openAttendance(exam)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                          canMark
                            ? "bg-blue-600 text-white hover:bg-blue-700"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {canMark ? "Take Attendance" : exam.isLocked ? "View Attendance" : "View Hall"}
                      </button>
                      {canRequestTransfer && (
                        <button
                          type="button"
                          onClick={() => setTransferExam(exam)}
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                        >
                          <ArrowsRightLeftIcon className="h-4 w-4" />
                          Request Transfer
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

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
