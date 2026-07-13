/**
 * Public UUID utilities — numeric ids stay internal; APIs and URLs use public_uuid as "uuid".
 */
const db = require("../config/db");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TABLE = {
  users: "users",
  students: "students",
  faculty: "faculty",
  venues: "venues",
  exams: "exams",
  timetable: "timetable",
  ineligible: "ineligible_students",
  seatingPlans: "seating_plans",
  assignments: "faculty_assignments",
  attendanceSessions: "attendance_sessions",
  facultyTransferRequests: "faculty_transfer_requests",
};

function isValidUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value.trim());
}

function isLegacyNumericId(value) {
  if (value == null || value === "") return false;
  const s = String(value).trim();
  return /^\d+$/.test(s) && Number(s) > 0;
}

function invalidUuidError() {
  const err = new Error("Not found");
  err.code = "INVALID_UUID";
  err.statusCode = 404;
  return err;
}

async function resolveInternalId(table, param, { allowLegacyNumeric = false } = {}) {
  if (param == null || param === "") return null;

  const raw = String(param).trim();

  if (isValidUuid(raw)) {
    const [rows] = await db.query(
      `SELECT id FROM ${table} WHERE public_uuid = ? LIMIT 1`,
      [raw]
    );
    return rows[0]?.id ?? null;
  }

  if (allowLegacyNumeric && isLegacyNumericId(raw)) {
    const numId = parseInt(raw, 10);
    const [rows] = await db.query(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`, [numId]);
    return rows[0]?.id ?? null;
  }

  return null;
}

async function getPublicUuid(table, internalId) {
  if (!internalId) return null;
  const [rows] = await db.query(
    `SELECT public_uuid FROM ${table} WHERE id = ? LIMIT 1`,
    [internalId]
  );
  return rows[0]?.public_uuid ?? rows[0]?.publicuuid ?? null;
}

async function resolveOrThrow(table, param, options) {
  const id = await resolveInternalId(table, param, options);
  if (!id) throw invalidUuidError();
  return id;
}

/**
 * Map a DB row to a public API object: expose uuid, strip internal id / public_uuid / *_id FKs.
 */
function toPublicRow(row, { keepKeys = [] } = {}) {
  if (!row || typeof row !== "object") return row;

  const out = {};
  const skip = new Set([
    "id",
    "public_uuid",
    "publicuuid",
    "role_id",
    "owner_user_id",
    "owneruserid",
    "created_by",
    "createdby",
    "created_by_hod_id",
    "createdbyhodid",
    "user_id",
    "userid",
    "faculty_id",
    "facultyid",
    "exam_id",
    "examid",
    "venue_id",
    "venueid",
    "student_id",
    "studentid",
    "seating_plan_id",
    "seatingplanid",
    "manually_changed_by",
    "manuallychangedby",
    "internalid",
    "internal_id",
  ]);

  const uuid = row.public_uuid ?? row.publicuuid ?? row.uuid;
  if (uuid) out.uuid = uuid;

  for (const [key, value] of Object.entries(row)) {
    const lower = key.toLowerCase();
    if (skip.has(lower) || skip.has(key)) continue;
    if (keepKeys.includes(key)) {
      out[key] = value;
      continue;
    }
    if (lower.endsWith("_id") || lower.endsWith("id") && lower !== "uuid" && lower !== "regnno") {
      if (lower === "regnno" || lower === "regn_no") {
        out[key] = value;
      }
      continue;
    }
    out[key] = value;
  }

  return out;
}

function stripIdsFromObject(obj) {
  if (Array.isArray(obj)) return obj.map(stripIdsFromObject);
  if (!obj || typeof obj !== "object") return obj;

  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (
      lower === "id" ||
      lower.endsWith("id") &&
        !["uuid", "regnno", "microsoftid", "examcode", "coursecode"].includes(lower)
    ) {
      if (lower === "uuid" || key === "uuid") out[key] = value;
      continue;
    }
    if (lower === "public_uuid" || lower === "publicuuid") continue;
    out[key] = stripIdsFromObject(value);
  }
  if (obj.uuid && !out.uuid) out.uuid = obj.uuid;
  return out;
}

module.exports = {
  TABLE,
  UUID_REGEX,
  isValidUuid,
  isLegacyNumericId,
  resolveInternalId,
  resolveOrThrow,
  getPublicUuid,
  toPublicRow,
  stripIdsFromObject,
  invalidUuidError,
};
