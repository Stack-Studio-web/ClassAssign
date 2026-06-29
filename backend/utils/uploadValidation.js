const path = require("path");

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES) || 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".xlsx", ".xls"]);
const ALLOWED_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream",
]);

function validateUploadedFile(file) {
  if (!file) {
    return { valid: false, message: "No file uploaded." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { valid: false, message: "File exceeds maximum allowed size (5 MB)." };
  }
  const ext = path.extname(file.originalname || file.filename || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { valid: false, message: "Only .xlsx and .xls files are allowed." };
  }
  if (file.mimetype && !ALLOWED_MIMES.has(file.mimetype)) {
    return { valid: false, message: "Invalid file type. Upload an Excel spreadsheet." };
  }
  return { valid: true };
}

module.exports = { MAX_UPLOAD_BYTES, validateUploadedFile };
