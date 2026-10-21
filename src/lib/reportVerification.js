/**
 * Hallora report helpers (client).
 * Export stamps / e-verify footers are disabled — helpers remain as no-ops
 * so older call sites do not inject branding into PDFs/prints/DOCX.
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

/** Normalize API / DB shapes. */
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

/** Disabled: exports must not include Hallora generated/e-verify stamps. */
export function halloraFooterLines(_verification) {
  return { line1: "", line2: "" };
}

/** Disabled: no HTML stamp footer in print layouts. */
export function halloraFooterHtml(_verification) {
  return "";
}

/** Disabled: no print CSS for Hallora verify stamps. */
export const HALLORA_VERIFY_PRINT_CSS = ``;

/**
 * Allocate a Hallora Verification ID for a report export.
 * Kept for API compatibility; export UIs no longer stamp documents with it.
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
