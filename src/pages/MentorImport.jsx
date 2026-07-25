import React from "react";
import { useAcademicContext } from "../context/AcademicContext";
import { MentorManagementNav } from "../Components/MentorManagementNav";
import MentorImportCard from "../Components/mentor/MentorImportCard";
import BatchSelector from "../Components/BatchSelector";
import AcademicYearSemesterSelector from "../Components/AcademicYearSemesterSelector";
import CompletedSemesterBanner from "../Components/CompletedSemesterBanner";

export default function MentorImportPage() {
  const { selectedYear, selectedSemester, isSelectedSemesterCompleted } = useAcademicContext();

  const hasContext = Boolean(selectedYear?.uuid && selectedSemester?.uuid);

  return (
    <div className="space-y-6 pb-10">      <MentorManagementNav />

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Import Mentors
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload an Excel file to map students to mentors. Mentors are created automatically when they do not exist.
        </p>
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Academic Context</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <AcademicYearSemesterSelector />
          <BatchSelector />
        </div>
      </section>

      {isSelectedSemesterCompleted && <CompletedSemesterBanner />}

      {hasContext ? (
        <MentorImportCard />
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-14 text-center text-gray-500">
          Select an academic year, semester, and batch to import mentor mappings.
        </div>
      )}
    </div>
  );
}
