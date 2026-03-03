import React, { useState, useRef, useEffect } from "react";
import { Bars3Icon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { useSidebar } from "../context/SidebarContext";
import Logo from "../assets/logo.png";

const NAVBAR_BG = "#1A202C";

const formatRole = (role) => {
  if (!role) return "";
  const map = {
    admin: "Admin",
    faculty_incharge: "Faculty Incharge",
    coe: "COE",
  };
  return map[role] || role;
};

export default function DashboardNavbar() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { setMobileMenuOpen } = useSidebar();

  const userStr = typeof window !== "undefined" ? sessionStorage.getItem("user") : null;
  const user = userStr ? (() => { try { return JSON.parse(userStr); } catch { return null; } })() : null;
  const displayName = user?.name || user?.displayName || user?.username || "User";
  const email = user?.email || "";
  const role = user?.role ? formatRole(user.role) : "";

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center justify-between px-4 lg:px-6 border-b border-white/10"
      style={{ backgroundColor: NAVBAR_BG }}
    >
      {/* Left: mobile menu + logo + title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={() => setMobileMenuOpen?.(true)}
          className="lg:hidden p-2 -ml-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Open menu"
        >
          <Bars3Icon className="h-6 w-6" />
        </button>
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={Logo}
            alt="Logo"
            className="h-9 w-9 shrink-0 object-contain rounded-lg bg-white/10"
          />
          <span className="text-white font-semibold text-lg truncate hidden sm:inline">
            KCT ClassAlign
          </span>
        </div>
      </div>

      {/* Right: profile + dropdown */}
      <div className="relative flex items-center gap-2" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((o) => !o)}
          className="flex items-center gap-2 pl-2 pr-2 py-1.5 rounded-lg text-gray-200 hover:bg-white/10 transition-colors min-w-0"
          aria-expanded={dropdownOpen}
          aria-haspopup="true"
        >
          <div className="h-8 w-8 rounded-full bg-indigo-500 flex items-center justify-center shrink-0 text-white text-sm font-medium">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <span className="max-w-[120px] sm:max-w-[180px] truncate text-sm font-medium text-white">
            {displayName}
          </span>
          <ChevronDownIcon
            className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
          />
        </button>

        {dropdownOpen && (
          <div
            className="absolute right-4 top-full mt-1 w-64 rounded-xl bg-white shadow-lg border border-gray-200 py-2 z-50"
            role="menu"
          >
            <div className="px-4 py-2 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</p>
              <p className="text-sm text-gray-900 mt-0.5 truncate">{email || "—"}</p>
            </div>
            <div className="px-4 py-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Role</p>
              <p className="text-sm text-gray-900 mt-0.5">{role || "—"}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
