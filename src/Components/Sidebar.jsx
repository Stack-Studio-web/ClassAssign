import React, { useEffect, useState } from "react";
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
  ChevronDownIcon,
  ArrowsRightLeftIcon,
  AcademicCapIcon,
  RectangleStackIcon,
  TableCellsIcon,
  BellAlertIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { NavLink, useLocation } from "react-router-dom";
import { useSidebar } from "../context/SidebarContext";
import { logout } from "../lib/api";

const ADMIN_NAV = [
  { to: "/allotment", label: "Dashboard", icon: ComputerDesktopIcon },
  { to: "/student/academic", label: "Academic Management", icon: CalendarDaysIcon },
  { to: "/student/batches", label: "Batch Management", icon: RectangleStackIcon },
  { to: "/student/browser", label: "Student Browser", icon: TableCellsIcon },
  { to: "/mentor/import", label: "Mentor Management", icon: UsersIcon },
  { to: "/faculty", label: "Faculty Management", icon: UserPlusIcon },
  { to: "/report", label: "Reports", icon: NewspaperIcon },
  { to: "/report/completed", label: "Completed Reports", icon: CheckCircleIcon },
  { to: "/venue", label: "Venue", icon: BuildingOfficeIcon },
  { to: "/timetable", label: "Timetable", icon: CalendarDaysIcon },
  { to: "/Hall", label: "Hall Allotment", icon: BuildingOfficeIcon },
  { to: "/admin/notifications", label: "Hall Notifications", icon: BellAlertIcon },
  { to: "/admin/attendance/transfers", label: "Mutual Faculty Requests", icon: ArrowsRightLeftIcon },
  { to: "/change", label: "Change Faculty", icon: UserPlusIcon },
  { to: "/attendance", label: "Active Attendance", icon: UserGroupIcon },
  { to: "/attendance/completed", label: "Completed Attendance", icon: CheckCircleIcon },
  { to: "/ineligibility/view", label: "Ineligibility", icon: ExclamationTriangleIcon },
  { to: "/users", label: "User Management", icon: UsersIcon },
  { to: "/admin/academic-contexts", label: "Academic Contexts", icon: AcademicCapIcon },
  { to: "/admin/ownership", label: "Ownership Mapping", icon: ShieldCheckIcon },
  { to: "/admin/qpak", label: "QPAK", icon: DocumentTextIcon },
  { to: "/logs", label: "Logs", icon: NewspaperIcon },
];

const FACULTY_NAV = [
  { to: "/allotment", label: "Allotment", icon: ComputerDesktopIcon },
  { to: "/student/academic", label: "Academic Management", icon: AcademicCapIcon },
  { to: "/student/batches", label: "Batch Management", icon: RectangleStackIcon },
  { to: "/student/browser", label: "Student Browser", icon: TableCellsIcon },
  { to: "/mentor/import", label: "Mentor Management", icon: UsersIcon },
  { to: "/faculty", label: "Faculty Management", icon: UserPlusIcon },
  { to: "/report", label: "Reports", icon: NewspaperIcon },
  { to: "/venue", label: "Venue", icon: BuildingOfficeIcon },
  { to: "/timetable", label: "Timetable", icon: CalendarDaysIcon },
  { to: "/admin/notifications", label: "Hall Notifications", icon: BellAlertIcon },
  { to: "/admin/attendance/transfers", label: "Mutual Faculty Requests", icon: ArrowsRightLeftIcon },
  { to: "/attendance", label: "Active Attendance", icon: UserGroupIcon },
  { to: "/ineligibility/view", label: "Ineligibility", icon: ExclamationTriangleIcon },
  { to: "/admin/qpak", label: "QPAK", icon: DocumentTextIcon },
];

const HOD_NAV = [
  { to: "/student/academic", label: "Academic Context", icon: AcademicCapIcon },
  { to: "/student/batches", label: "Batch Management", icon: RectangleStackIcon },
  { to: "/student/browser", label: "Student Browser", icon: TableCellsIcon },
  { to: "/report", label: "Reports", icon: NewspaperIcon },
  { to: "/report/completed", label: "Completed Reports", icon: CheckCircleIcon },
  { to: "/timetable", label: "Timetable", icon: CalendarDaysIcon },
  { to: "/attendance", label: "Active Attendance", icon: UserGroupIcon },
  { to: "/attendance/completed", label: "Completed Attendance", icon: CheckCircleIcon },
  { to: "/Hall", label: "Hall Allotment", icon: BuildingOfficeIcon },
  { to: "/admin/attendance/transfers", label: "Mutual Faculty Requests", icon: ArrowsRightLeftIcon },
  { to: "/change", label: "Change Faculty", icon: UserPlusIcon },
  { to: "/users", label: "User Management", icon: UsersIcon },
];

/** Faculty In-Charge sidebar — Academic Management is a collapsible group. */
const FACULTY_INCHARGE_NAV = [
  {
    label: "Academic Management",
    icon: AcademicCapIcon,
    children: [
      { to: "/student/batches", label: "Batch Management", icon: RectangleStackIcon },
      { to: "/student/browser", label: "Student Browser", icon: TableCellsIcon },
    ],
  },
  { to: "/faculty", label: "Faculty Management", icon: UserPlusIcon },
  { to: "/timetable", label: "Time Table", icon: CalendarDaysIcon },
  { to: "/venue", label: "Venue", icon: BuildingOfficeIcon },
  { to: "/allotment", label: "Allotment", icon: ComputerDesktopIcon },
  { to: "/report", label: "Reports", icon: NewspaperIcon },
  { to: "/admin/attendance/transfers", label: "Mutual Faculty Request", icon: ArrowsRightLeftIcon },
  { to: "/attendance", label: "Attendance", icon: UserGroupIcon },
  { to: "/admin/qpak", label: "QPAK", icon: DocumentTextIcon },
];

const linkClassName = (isActive, collapsed, open) =>
  `flex items-center gap-3 rounded-lg text-[15px] font-medium transition-all duration-200
  ${collapsed && !open ? "lg:justify-center lg:px-0 lg:py-3 px-4 py-3" : "px-4 py-3"}
  ${isActive
    ? "bg-gray-100 text-gray-900 font-semibold"
    : "text-gray-600 hover:bg-gray-50 hover:text-gray-800"
  }`;

const NavItemLink = ({ to, label, icon: Icon, collapsed, open, onNavigate, end }) => (
  <NavLink
    to={to}
    end={end}
    onClick={onNavigate}
    className={({ isActive }) => linkClassName(isActive, collapsed, open)}
  >
    <Icon className="h-5 w-5 shrink-0 text-inherit" />
    {(!collapsed || open) && <span className="truncate">{label}</span>}
  </NavLink>
);

const NavGroup = ({ item, collapsed, open, onNavigate, pathname }) => {
  const childActive = item.children.some(
    (child) => pathname === child.to || pathname.startsWith(`${child.to}/`)
  );
  const [expanded, setExpanded] = useState(childActive);

  useEffect(() => {
    if (childActive) setExpanded(true);
  }, [childActive]);

  const showLabels = !collapsed || open;
  const Icon = item.icon;

  return (
    <li>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={`w-full flex items-center gap-3 rounded-lg text-[15px] font-medium transition-all duration-200
          ${collapsed && !open ? "lg:justify-center lg:px-0 lg:py-3 px-4 py-3" : "px-4 py-3"}
          ${childActive
            ? "bg-gray-100 text-gray-900 font-semibold"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-800"
          }`}
      >
        <Icon className="h-5 w-5 shrink-0 text-inherit" />
        {showLabels && (
          <>
            <span className="truncate flex-1 text-left">{item.label}</span>
            <ChevronDownIcon
              className={`h-4 w-4 shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            />
          </>
        )}
      </button>
      {expanded && (
        <ul className={`mt-0.5 space-y-0.5 ${showLabels ? "ml-3 pl-2 border-l border-gray-200" : ""}`}>
          {item.children.map((child) => (
            <li key={`${child.to}-${child.label}`}>
              <NavItemLink
                to={child.to}
                label={child.label}
                icon={child.icon}
                collapsed={collapsed}
                open={open}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

const Sidebar = () => {
  const ctx = useSidebar();
  const location = useLocation();
  const collapsed = ctx?.collapsed ?? false;
  const setCollapsed = ctx?.setCollapsed ?? (() => {});
  const open = ctx?.mobileMenuOpen ?? false;
  const setOpen = ctx?.setMobileMenuOpen ?? (() => {});

  const user = (() => {
    try {
      const raw = sessionStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();
  const userRole = user?.role;

  if (!userRole) return null;

  const handleLogout = () => logout();
  const closeMobile = () => setOpen(false);

  let navItems;
  if (userRole === "hod") {
    navItems = HOD_NAV;
  } else if (userRole === "admin") {
    navItems = ADMIN_NAV;
  } else if (userRole === "faculty_incharge") {
    navItems = FACULTY_INCHARGE_NAV;
  } else {
    navItems = FACULTY_NAV;
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 top-14 bg-black/40 z-30 lg:hidden backdrop-blur-sm transition-opacity duration-200"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={`fixed top-14 left-0 bottom-0 z-40 flex flex-col text-gray-800 transition-all duration-300 ease-in-out
          bg-white border-r border-gray-200
          ${collapsed ? "lg:w-20" : "lg:w-64"} w-64
          ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0
          rounded-none lg:top-14 lg:h-[calc(100vh-3.5rem)]`}
        style={{ fontFamily: "'Inter', 'Poppins', system-ui, sans-serif" }}
      >
        <button
          onClick={() => setOpen(false)}
          className="lg:hidden absolute top-3 right-3 p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Close menu"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>

        <nav className="flex-1 overflow-y-auto scrollbar-hide pt-12 lg:pt-4 pb-4 px-3 min-h-0">
          <ul className="space-y-0.5">
            {navItems.map((item) =>
              item.children ? (
                <NavGroup
                  key={item.label}
                  item={item}
                  collapsed={collapsed}
                  open={open}
                  onNavigate={closeMobile}
                  pathname={location.pathname}
                />
              ) : (
                <li key={`${item.to}-${item.label}`}>
                  <NavItemLink
                    to={item.to}
                    label={item.label}
                    icon={item.icon}
                    collapsed={collapsed}
                    open={open}
                    onNavigate={closeMobile}
                  />
                </li>
              )
            )}
          </ul>
        </nav>

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
