import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { logout } from "../lib/api";
import { CalendarDaysIcon, MapPinIcon, UsersIcon } from "@heroicons/react/24/outline";
import { getWindowBadge } from "../lib/attendanceWindow";

export default function FacultyDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [faculty, setFaculty] = useState(null);
  const [exams, setExams] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/faculty-attendance/my-exams");
        setFaculty(res.data.faculty);
        setExams(res.data.exams || []);
      } catch (err) {
        setError(err.response?.data?.message || err.response?.data?.error || "Failed to load assigned exams");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

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
                    </div>
                    <button
                      onClick={() => openAttendance(exam)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                        canMark
                          ? "bg-blue-600 text-white hover:bg-blue-700"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {canMark ? "Mark Attendance" : exam.isLocked ? "View Attendance" : "View Hall"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
