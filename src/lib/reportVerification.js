/**
 * Hallora report e-verification helpers (client).
 * No QR. Footer only. SHA-256 of final PDF when bytes are available.
 */
import api from "./api";

export function formatHalloraGeneratedAt(isoOrDate) {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** Normalize API / DB shapes so footers always see verificationId. */
export function normalizeVerification(data) {
  if (!data || typeof data !== "object") return null;
  const verificationId = data.verificationId || data.verification_id || "";
  if (!verificationId) return null;
  return {
    ...data,
    uuid: data.uuid || data.public_uuid || data.publicUuid || null,
    verificationId,
    generatedAt:
      data.generatedAt || data.generated_at || new Date().toISOString(),
    reportType: data.reportType || data.report_type || null,
    generatedByLabel:
      data.generatedByLabel || data.generated_by_label || null,
    status: data.status || "VALID",
  };
}

export function halloraFooterLines(verification) {
  const v = normalizeVerification(verification) || verification;
  const id = v?.verificationId || v?.verification_id || "";
  const when = formatHalloraGeneratedAt(v?.generatedAt || v?.generated_at);
  return {
    line1: "Generated and E-Verified by HALLORA | Exam Management System",
    line2: `Verification ID: ${id} | Generated: ${when}`,
  };
}

/** Compact HTML footer for print layouts (every page via CSS fixed bottom). */
export function halloraFooterHtml(verification) {
  const { line1, line2 } = halloraFooterLines(verification);
  return `
<div class="hallora-verify-footer">
  <div class="hallora-verify-line">${line1}</div>
  <div class="hallora-verify-line">${line2}</div>
</div>`;
}

export const HALLORA_VERIFY_PRINT_CSS = `
@media print {
  @page {
    margin-bottom: 16mm;
  }
  .hallora-verify-footer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 4px 10mm 5px;
    border-top: 1px solid #888;
    background: #fff;
    color: #333;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 8pt;
    line-height: 1.35;
    text-align: center;
    z-index: 9999;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .hallora-verify-line { margin: 0; }
  body { padding-bottom: 14mm !important; }
}
.hallora-verify-footer {
  margin-top: 16px;
  padding-top: 8px;
  border-top: 1px solid #ccc;
  color: #444;
  font-size: 11px;
  text-align: center;
  line-height: 1.4;
}
`;

/**
 * Allocate a Hallora Verification ID for a report export.
 */
export async function createReportVerification(reportType, metadata = null) {
  const res = await api.post("/report-verifications", {
    reportType,
    ...(metadata ? { metadata } : {}),
  });
  const verification = normalizeVerification(res.data);
  if (!verification?.verificationId) {
    throw new Error("Server did not return a Hallora Verification ID");
  }
  return verification;
}

/**
 * Store SHA-256 hex of the final PDF bytes.
 */
export async function finalizeReportVerification(uuid, documentHash) {
  const res = await api.patch(`/report-verifications/${uuid}/finalize`, {
    documentHash,
  });
  return res.data;
}

/** SHA-256 hex digest of an ArrayBuffer / Blob / Uint8Array. */
export async function sha256Hex(data) {
  let buffer;
  if (data instanceof ArrayBuffer) {
    buffer = data;
  } else if (typeof Blob !== "undefined" && data instanceof Blob) {
    buffer = await data.arrayBuffer();
  } else if (data instanceof Uint8Array) {
    buffer = data.buffer;
  } else if (typeof data === "string") {
    buffer = new TextEncoder().encode(data);
  } else {
    throw new Error("Unsupported data type for SHA-256");
  }
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Full flow for a PDF Blob: finalize hash on server.
 */
export async function finalizePdfVerification(verification, pdfBlob) {
  if (!verification?.uuid || !pdfBlob) return null;
  const hash = await sha256Hex(pdfBlob);
  return finalizeReportVerification(verification.uuid, hash);
}
