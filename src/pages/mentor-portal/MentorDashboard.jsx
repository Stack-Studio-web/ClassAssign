import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  UsersIcon,
  UserMinusIcon,
  ClockIcon,
  CheckCircleIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { fetchMentorDashboard } from "../../lib/mentorPortalApi";

function StatCard({ icon: Icon, count, label, color, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all w-full"
    >
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center mb-3 ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-3xl font-bold text-gray-900">{count}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </button>
  );
}

function DoughnutChart({ present, absent }) {
  const total = present + absent || 1;
  const presentPct = (present / total) * 100;
  const circumference = 2 * Math.PI * 40;
  const presentDash = (presentPct / 100) * circumference;

  return (
    <div className="flex items-center gap-6">
      <svg width="120" height="120" viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r="40" fill="none" stroke="#fee2e2" strokeWidth="12" />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="#2563eb"
          strokeWidth="12"
          strokeDasharray={`${presentDash} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-600" />
          <span className="text-gray-600">Present: <strong>{present}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-200" />
          <span className="text-gray-600">Absent: <strong>{absent}</strong></span>
        </div>
      </div>
    </div>
  );
}

export default function MentorDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMentorDashboard()
      .then(setStats)
      .catch((err) => setError(err.response?.data?.message || "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
    );
  }

  const notifications = stats?.recentNotifications?.length
    ? stats.recentNotifications
    : [
        { message: "No new notifications", timestamp: new Date().toISOString() },
      ];

  const activity = stats?.recentActivity?.length
    ? stats.recentActivity
    : [{ message: "No recent activity", timestamp: new Date().toISOString() }];

  const deadlines = stats?.upcomingDeadlines?.length
    ? stats.upcomingDeadlines
    : [
        { label: "Retest Submission End Date", date: "—" },
        { label: "Faculty Approval End Date", date: "—" },
        { label: "Retest Examination Date", date: "—" },
      ];

  const overview = stats?.attendanceOverview || { present: 0, absent: 0 };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={UsersIcon}
          count={stats?.assignedStudents ?? 0}
          label="Assigned Students"
          color="bg-blue-50 text-blue-600"
          onClick={() => navigate("/mentor-portal/students")}
        />
        <StatCard
          icon={UserMinusIcon}
          count={stats?.absentStudents ?? 0}
          label="Absent Students (Latest Exam)"
          color="bg-red-50 text-red-600"
        />
        <StatCard
          icon={ClockIcon}
          count={stats?.pendingRetestApplications ?? 0}
          label="Pending Retest Applications"
          color="bg-amber-50 text-amber-600"
          onClick={() => navigate("/mentor-portal/retest-applications")}
        />
        <StatCard
          icon={CheckCircleIcon}
          count={stats?.approvedApplications ?? 0}
          label="Approved Applications"
          color="bg-green-50 text-green-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Recent Notifications</h3>
          <ul className="space-y-3">
            {notifications.map((n, i) => (
              <li key={i} className="flex gap-3 text-sm border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                <BellDot className="shrink-0 mt-0.5" />
                <div>
                  <p className="text-gray-700">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {n.timestamp ? new Date(n.timestamp).toLocaleString() : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Attendance Overview</h3>
          <DoughnutChart present={overview.present} absent={overview.absent} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Recent Activity</h3>
          <ol className="relative border-l border-gray-200 ml-2 space-y-4">
            {activity.map((a, i) => (
              <li key={i} className="ml-4">
                <span className="absolute -left-1.5 w-3 h-3 bg-blue-600 rounded-full border-2 border-white" />
                <p className="text-sm text-gray-700">{a.message}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {a.timestamp ? new Date(a.timestamp).toLocaleString() : ""}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Upcoming Deadlines</h3>
          <ul className="space-y-3">
            {deadlines.map((d, i) => (
              <li key={i} className="text-sm">
                <p className="text-gray-600">{d.label}</p>
                <p className="font-medium text-gray-900">{d.date}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          {[
            { label: "View Students", to: "/mentor-portal/students" },
            { label: "Review Applications", to: "/mentor-portal/retest-applications" },
            { label: "Export Reports", to: "/mentor-portal/export-reports" },
          ].map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => navigate(action.to)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              {action.label}
              <ArrowRightIcon className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BellDot() {
  return (
    <span className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
      <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    </span>
  );
}
