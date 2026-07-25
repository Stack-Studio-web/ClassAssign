import React from "react";
import { WorkflowStepper } from "./academic-management/WorkflowStepper";

export function StudentManagementNav() {
  return (
    <div className="space-y-4 border-b border-gray-200 pb-4">
      <WorkflowStepper />
    </div>
  );
}
