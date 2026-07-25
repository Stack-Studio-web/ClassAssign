import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "../lib/utils";

const LINKS = [
  { to: "/mentor/import", label: "Import Mentors" },
  { to: "/mentor/list", label: "Mentor List" },
  { to: "/mentor/mapping", label: "Student-Mentor Mapping" },
];

export function MentorManagementNav() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Mentor management"
      className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-4"
    >
      {LINKS.map(({ to, label }) => {
        const active = pathname === to || pathname.startsWith(`${to}/`);
        return (
          <NavLink
            key={to}
            to={to}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              active
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
            )}
          >
            {label}
          </NavLink>
        );
      })}
    </nav>
  );
}

export default MentorManagementNav;
