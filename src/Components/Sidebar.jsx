import React, { useState } from "react";
import {
  ComputerDesktopIcon,
  Cog6ToothIcon,
  NewspaperIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  UserPlusIcon,
  UsersIcon
} from "@heroicons/react/24/outline";
import { NavLink } from "react-router-dom";
import Logo from "../assets/logo.png";

const Sidebar = () => {
  const [open, setOpen] = useState(false);

  // 🔐 Read user role from session storage
  const user = JSON.parse(sessionStorage.getItem("user"));
  const userRole = user?.role;

  if (!userRole) return null;

  /* ================= LOGOUT ================= */
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

  /* ================= NAVIGATION ITEMS ================= */
  // Base items visible to everyone (Admin, Faculty, CEO)
  const navItems = [
    { to: "/venue", label: "Venue", icon: BuildingOfficeIcon },
    { to: "/student", label: "Student", icon: UserGroupIcon },
    { to: "/faculty", label: "Faculty", icon: UserPlusIcon },
  ];

  // ✅ Add Allotment ONLY if user is NOT a CEO (coe)
  if (userRole !== "coe") {
    navItems.push({ to: "/allotment", label: "Allotment", icon: ComputerDesktopIcon });
  }

  // Add Report for everyone
  navItems.push({ to: "/report", label: "Report", icon: NewspaperIcon });

  // ✅ Add Admin-only items
  if (userRole === "admin") {
    navItems.push(
      { to: "/users", label: "User Management", icon: UsersIcon },
      { to: "/logs", label: "Logs", icon: NewspaperIcon }
    );
  }

  // Add Settings for everyone
  navItems.push({ to: "/settings", label: "Settings", icon: Cog6ToothIcon });

  return (
    <>
      {/* ================= HAMBURGER (Mobile) ================= */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-white shadow-md"
      >
        <Bars3Icon className="h-6 w-6 text-gray-700" />
      </button>

      {/* ================= OVERLAY ================= */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ================= SIDEBAR ================= */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-64 bg-gradient-to-b
        from-[#f8fbff] via-[#e6f0fa] to-[#d6e4f5] text-gray-800 shadow-lg
        flex flex-col z-50 transform transition-transform duration-300
        ${open ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      >
        {/* Close Button (Mobile) */}
        <button
          onClick={() => setOpen(false)}
          className="lg:hidden absolute top-4 right-4 p-1"
        >
          <XMarkIcon className="h-6 w-6 text-gray-700" />
        </button>

        {/* Logo */}
        <div className="flex items-center space-x-3 p-6 border-b border-gray-200">
          <img src={Logo} alt="KCT Logo" className="w-12 h-12 object-contain" />
          <span className="text-xl font-semibold text-[#1e3c72]">
            KCT ClassAlign
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 mt-6 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-5 py-3 rounded-lg text-sm font-medium transition-all duration-200
                ${
                  isActive
                    ? "border-b-2 border-[#1e3c72] text-[#1e3c72] font-semibold bg-[#eaf1fb]"
                    : "text-gray-700 hover:bg-[#eaf1fb]"
                }`
              }
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-5 py-3 rounded-lg text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5" />
            <span>Logout</span>
          </button>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 text-xs text-gray-500 text-center">
          © 2025 KCT • All Rights Reserved
        </div>
      </aside>
    </>
  );
};

export default Sidebar;