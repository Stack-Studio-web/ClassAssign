import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  HomeIcon,
  UsersIcon,
  DocumentTextIcon,
  BellIcon,
  ArrowDownTrayIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { fetchMentorUser, mentorLogout } from "../../lib/mentorPortalApi";
import Loader from "../Loader";
import UserAvatar from "../UserAvatar";

const NAV_ITEMS = [
  { to: "/mentor-portal/dashboard", label: "Dashboard", icon: HomeIcon },
  { to: "/mentor-portal/students", label: "My Students", icon: UsersIcon },
  { to: "/mentor-portal/retest-applications", label: "Retest Applications", icon: DocumentTextIcon },
  { to: "/mentor-portal/notifications", label: "Notifications", icon: BellIcon },
  { to: "/mentor-portal/export-reports", label: "Export Reports", icon: ArrowDownTrayIcon },
  { to: "/mentor-portal/profile", label: "Profile", icon: UserCircleIcon },
];

const PAGE_TITLES = {
  "/mentor-portal/dashboard": "Dashboard",
  "/mentor-portal/students": "My Students",
  "/mentor-portal/retest-applications": "Retest Applications",
  "/mentor-portal/notifications": "Notifications",
  "/mentor-portal/export-reports": "Export Reports",
  "/mentor-portal/profile": "Profile",
};

export function MentorGuard({ children, allowPasswordChange = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      const user = await fetchMentorUser();
      if (!user || user.role !== "mentor") {
        navigate("/mentor-portal/login", { replace: true, state: { from: location.pathname } });
        return;
      }
      if (allowPasswordChange) {
        setChecking(false);
        return;
      }
      if (
        user.mustChangePassword &&
        location.pathname !== "/mentor-portal/change-password"
      ) {
        navigate("/mentor-portal/change-password", { replace: true });
        return;
      }
      setChecking(false);
    };
    check();
  }, [navigate, location.pathname, allowPasswordChange]);

  if (checking) return <Loader fullPage message="Loading mentor portal..." size="xl" />;
  return children;
}

export default function MentorLayout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mentor, setMentor] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchMentorUser().then(setMentor);
  }, []);

  const pageTitle = PAGE_TITLES[location.pathname] || "Mentor Portal";
  const avatarUrl = mentor?.hasAvatar
    ? mentor?.avatarUrl || "/api/auth/me/avatar"
    : null;

  const handleLogout = () => mentorLogout("/mentor-portal/login");

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <p className="font-bold text-blue-700">Mentor Portal</p>
            <p className="text-xs text-gray-500">Hallora</p>
          </div>
          <button type="button" className="lg:hidden p-1" onClick={() => setSidebarOpen(false)}>
            <XMarkIcon className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t">
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5" />
            Logout
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="px-4 py-3 flex items-center gap-4">
            <button
              type="button"
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
              onClick={() => setSidebarOpen(true)}
            >
              <Bars3Icon className="w-6 h-6 text-gray-600" />
            </button>

            <h1 className="text-lg font-semibold text-gray-900 shrink-0">{pageTitle}</h1>

            <div className="flex-1 max-w-md hidden sm:block">
              <div className="relative">
                <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search students, applications..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <button type="button" className="p-2 rounded-lg hover:bg-gray-100 relative">
                <BellIcon className="w-6 h-6 text-gray-500" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
              </button>

              <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
                <UserAvatar
                  name={mentor?.username || mentor?.email || "Mentor"}
                  avatarUrl={avatarUrl}
                  size="md"
                  bgClassName="bg-blue-600"
                />
                <div className="hidden md:block">
                  <p className="text-sm font-medium text-gray-900 leading-tight">
                    {mentor?.username || "Mentor"}
                  </p>
                  <p className="text-xs text-gray-500">{mentor?.department || "Department"}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet context={{ searchQuery }} />
        </main>
      </div>
    </div>
  );
}
