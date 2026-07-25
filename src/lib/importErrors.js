/**
 * Extract a user-facing message from import API errors (preview or import).
 * @param {import('axios').AxiosError} err
 */
export function getImportErrorMessage(err) {
  const data = err?.response?.data;
  if (!data) return err?.message || "Import failed.";

  const base = data.message || data.error || "Import failed.";
  const skipped = data.skippedRecords;
  if (Array.isArray(skipped) && skipped.length > 0) {
    const sample = skipped
      .slice(0, 3)
      .map((r) => r.reason || "Invalid row")
      .join("; ");
    return `${base} (${skipped.length} row(s) skipped: ${sample}${skipped.length > 3 ? "…" : ""})`;
  }
  return base;
}

/**
 * @param {import('axios').AxiosError} err
 */
export function getImportErrorDetails(err) {
  const data = err?.response?.data;
  return {
    message: getImportErrorMessage(err),
    skippedRecords: data?.skippedRecords ?? [],
    duplicateRecords: data?.duplicateRecords ?? [],
    code: data?.code,
  };
}
