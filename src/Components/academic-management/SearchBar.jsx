import React from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "../ui/Input";
import { cn } from "../../lib/utils";

export function SearchBar({ value, onChange, placeholder = "Search…", className }) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
        aria-label={placeholder}
      />
    </div>
  );
}

export function StatusFilter({ value, onChange, className }) {
  return (
    <div className={cn("relative", className)}>
      <SlidersHorizontal
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        aria-hidden
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Filter by status"
        className="h-10 w-full appearance-none rounded-lg border border-gray-200 bg-white pl-9 pr-8 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="all">All Status</option>
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>
    </div>
  );
}
