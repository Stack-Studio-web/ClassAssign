import React from "react";
import { Users, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/Button";

export function StudentEmptyState({ importPath = "/student/manage", message }) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm">
        <Users className="h-8 w-8 text-gray-300" aria-hidden />
      </div>
      <h3 className="mt-4 text-lg font-bold text-gray-900">No Students Found</h3>
      <p className="mt-2 max-w-md text-sm text-gray-500">
        {message ||
          (importPath
            ? "No students match your filters. Import students from Student Management or adjust your search."
            : "No students match your filters in this completed semester.")}
      </p>
      {importPath && (
        <Button className="mt-6" onClick={() => navigate(importPath)}>
          <Upload className="h-4 w-4" aria-hidden />
          Go to Student Management
        </Button>
      )}
    </div>
  );
}
