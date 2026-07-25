/**
 * Extract department code from registration number.
 * Example: "23BIT001" → "BIT"
 */
export function deriveDepartmentFromRegnNo(regnNo) {
  if (!regnNo) return null;
  const match = String(regnNo).trim().toUpperCase().match(/^[0-9]{2}([A-Z]+)/);
  return match?.[1] ?? null;
}
