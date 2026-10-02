import React from "react";
import { halloraFooterLines } from "../lib/reportVerification";

/**
 * Subtle Hallora e-verification footer for print/PDF preview UIs.
 * Does not redesign the report — sits below existing content (and fixed on print pages).
 */
export default function HalloraVerifiedFooter({ verification, className = "" }) {
  if (!verification?.verificationId) return null;
  const { line1, line2 } = halloraFooterLines(verification);
  return (
    <div className={`hallora-verify-footer ${className}`.trim()}>
      <div className="hallora-verify-line">{line1}</div>
      <div className="hallora-verify-line">{line2}</div>
    </div>
  );
}
