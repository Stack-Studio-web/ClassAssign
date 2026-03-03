import React from "react";
import { useAcademicSession } from "../context/AcademicSessionContext";

export default function AcademicSessionBar() {
  const { ay, setAy, semester, setSemester, category, setCategory } = useAcademicSession();

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 lg:px-6 py-2 bg-white border-b border-gray-200 shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600 whitespace-nowrap">AY</span>
          <input
            type="text"
            value={ay}
            onChange={(e) => setAy(e.target.value)}
            placeholder="e.g. 2025-2026"
            className="w-28 lg:w-32 h-9 px-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600 whitespace-nowrap">Semester</span>
          <select
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            className="h-9 px-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white min-w-[100px]"
          >
            <option value="EVEN">EVEN</option>
            <option value="ODD">ODD</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600 whitespace-nowrap">Exam</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-9 px-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white min-w-[100px]"
          >
            <option value="CAT I">CAT I</option>
            <option value="CAT II">CAT II</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-gray-500 hidden sm:block">
        AY {ay} – {semester} SEM ({category})
      </p>
    </div>
  );
}
