import { Navigate } from "react-router-dom";

/** @deprecated Use /student/batches — import is now on Batch Management page. */
export default function StudentImportPage() {
  return <Navigate to="/student/batches" replace />;
}
