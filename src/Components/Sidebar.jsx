import React from "react";
import {
  ComputerDesktopIcon,
  NewspaperIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  ArrowRightOnRectangleIcon,
  XMarkIcon,
  UserPlusIcon,
  UsersIcon,
  ExclamationTriangleIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { NavLink } from "react-router-dom";
import { useSidebar } from "../context/SidebarContext";

const Sidebar = () => {
  const ctx = useSidebar();
  const collapsed = ctx?.collapsed ?? false;
  const setCollapsed = ctx?.setCollapsed ?? (() => {});
  const open = ctx?.mobileMenuOpen ?? false;
  const setOpen = ctx?.setMobileMenuOpen ?? (() => {});

  const user = JSON.parse(sessionStorage.getItem("user"));
  const userRole = user?.role;

  if (!userRole) return null;

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      sessionStorage.clear();
      window.location.href = "/";
    }
  };

  const navItems = [
    { to: "/venue", label: "Venue", icon: BuildingOfficeIcon },
    { to: "/student", label: "Student", icon: UserGroupIcon },
    { to: "/faculty", label: "Faculty", icon: UserPlusIcon },
  ];

  navItems.push({ to: "/timetable", label: "Timetable", icon: CalendarDaysIcon });

  if (userRole !== "coe") {
    navItems.push({ to: "/allotment", label: "Allotment", icon: ComputerDesktopIcon });
  }

  navItems.push({ to: "/report", label: "Report", icon: NewspaperIcon });

  if (userRole === "admin" || userRole === "faculty_incharge") {
    navItems.push({
      to: "/ineligibility/view",
      label: "Ineligibility",
      icon: ExclamationTriangleIcon,
    });
  }

  if (userRole === "admin") {
    navItems.push(
      { to: "/users", label: "User Management", icon: UsersIcon },
      { to: "/logs", label: "Logs", icon: NewspaperIcon }
    );
  }

  return (
    <>
      {/* Overlay (mobile) */}
      {open && (
        <div
          className="fixed inset-0 top-14 bg-black/40 z-30 lg:hidden backdrop-blur-sm transition-opacity duration-200"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-14 left-0 bottom-0 z-40 flex flex-col text-gray-800 transition-all duration-300 ease-in-out
          bg-white border-r border-gray-200
          ${collapsed ? "lg:w-20" : "lg:w-64"} w-64
          ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0
          rounded-none lg:top-14 lg:h-[calc(100vh-3.5rem)]`}
        style={{ fontFamily: "'Inter', 'Poppins', system-ui, sans-serif" }}
      >
        {/* Close (mobile only) */}
        <button
          onClick={() => setOpen(false)}
          className="lg:hidden absolute top-3 right-3 p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Close menu"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto scrollbar-hide pt-12 lg:pt-4 pb-4 px-3 min-h-0">
          <ul className="space-y-0.5">
            {navItems.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg text-[15px] font-medium transition-all duration-200
                    ${collapsed && !open ? "lg:justify-center lg:px-0 lg:py-3 px-4 py-3" : "px-4 py-3"}
                    ${isActive
                      ? "bg-gray-100 text-gray-900 font-semibold"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-800"
                    }`
                  }
                >
                  <Icon className="h-5 w-5 shrink-0 text-inherit" />
                  {(!collapsed || open) && <span className="truncate">{label}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Collapse toggle (desktop) */}
        <div className="shrink-0 p-3 border-t border-gray-100 hidden lg:block">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="w-full flex items-center justify-center gap-3 rounded-lg py-3 px-4 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all duration-200"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRightIcon className="h-5 w-5" />
            ) : (
              <>
                <ChevronLeftIcon className="h-5 w-5" />
                <span className="text-sm font-medium">Collapse</span>
              </>
            )}
          </button>
        </div>

        {/* Logout */}
        <div className="shrink-0 p-3 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className={`w-full flex items-center rounded-lg text-[15px] font-medium text-red-600 bg-red-50/80 hover:bg-red-100 transition-all duration-200
              ${collapsed && !open ? "lg:justify-center lg:px-0 lg:py-3 px-4 py-3 gap-3" : "gap-3 px-4 py-3"}`}
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5 shrink-0" />
            {(!collapsed || open) && <span>Logout</span>}
          </button>
        </div>

        {/* Footer */}
        {(!collapsed || open) && (
          <div className="shrink-0 px-4 py-3 border-t border-gray-100 text-center text-xs text-gray-500">
            © 2025 KCT • All Rights Reserved
          </div>
        )}
      </aside>
    </>
  );
};

export default Sidebar;
