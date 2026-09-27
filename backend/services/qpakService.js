const db = require("../config/db");
const fs = require("fs");
const path = require("path");
const { UPLOAD_ROOT } = require("../utils/ensureQpakSchema");

const EXAM_TYPES = new Set(["CAT1", "CAT2", "SEM"]);
const STATUSES = new Set(["DRAFT", "PUBLISHED"]);
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_FOLDER_FILES = 40;

function toFileRow(row) {
  if (!row) return null;
  return {
    uuid: asUuid(row.public_uuid ?? row.publicuuid),
    relativePath: row.relative_path ?? row.relativepath,
    originalName: path.basename(
      String(row.original_name ?? row.originalname ?? "document.pdf").replace(/\\/g, "/")
    ),
    fileSize: Number(row.file_size ?? row.filesize ?? 0),
  };
}

function asUuid(value) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  return String(value);
}

function toPublicRow(row, files = []) {
  if (!row) return null;
  return {
    uuid: asUuid(row.public_uuid ?? row.publicuuid),
    department: row.department,
    courseCode: row.course_code ?? row.coursecode,
    courseName: row.course_name ?? row.coursename,
    examType: row.exam_type ?? row.examtype,
    academicYear: row.academic_year ?? row.academicyear,
    semester: row.semester,
    batch: row.batch,
    folderName: row.folder_name ?? row.foldername ?? null,
    fileCount: files.length,
    files,
    publishedAt: row.published_at ?? row.publishedat ?? null,
  };
}

function toManageRow(row, files = []) {
  if (!row) return null;
  return {
    ...toPublicRow(row, files),
    status: row.status,
    uploadedBy: row.uploaded_by ?? row.uploadedby,
    facultyInchargeId: row.faculty_incharge_id ?? row.facultyinchargeid,
    uploaderName: row.uploader_name ?? row.uploadername ?? null,
    createdAt: row.created_at ?? row.createdat,
    updatedAt: row.updated_at ?? row.updatedat,
    publishedAt: row.published_at ?? row.publishedat ?? null,
  };
}

function normalizeFilters(query = {}) {
  return {
    dept: String(query.dept || query.department || "").trim(),
    course: String(query.course || query.courseCode || "").trim(),
    courseName: String(query.courseName || query.name || "").trim(),
    exam: String(query.exam || query.examType || "").trim().toUpperCase(),
    year: String(query.year || query.academicYear || "").trim(),
    semester: String(query.semester || "").trim(),
    batch: String(query.batch || "").trim(),
    status: String(query.status || "").trim().toUpperCase(),
    search: String(query.search || "").trim(),
  };
}

function applyFilters(sql, params, filters, { publishedOnly = false } = {}) {
  sql += ` AND deleted_at IS NULL`;
  if (publishedOnly) {
    sql += ` AND status = 'PUBLISHED'`;
  } else if (filters.status && STATUSES.has(filters.status)) {
    sql += ` AND status = ?`;
    params.push(filters.status);
  }

  if (filters.dept) {
    sql += ` AND UPPER(department) = UPPER(?)`;
    params.push(filters.dept);
  }
  if (filters.course) {
    sql += ` AND UPPER(course_code) = UPPER(?)`;
    params.push(filters.course);
  }
  if (filters.courseName) {
    sql += ` AND course_name ILIKE ?`;
    params.push(`%${filters.courseName}%`);
  }
  if (filters.exam) {
    sql += ` AND exam_type = ?`;
    params.push(filters.exam);
  }
  if (filters.year) {
    sql += ` AND academic_year = ?`;
    params.push(filters.year);
  }
  if (filters.semester) {
    sql += ` AND semester = ?`;
    params.push(filters.semester);
  }
  if (filters.batch) {
    sql += ` AND batch ILIKE ?`;
    params.push(`%${filters.batch}%`);
  }
  if (filters.search) {
    sql += ` AND (
      course_code ILIKE ? OR course_name ILIKE ? OR department ILIKE ?
      OR batch ILIKE ? OR academic_year ILIKE ?
    )`;
    const q = `%${filters.search}%`;
    params.push(q, q, q, q, q);
  }
  return { sql, params };
}

function validateMeta(body = {}) {
  const department = String(body.department || "").trim().toUpperCase();
  const courseCode = String(body.courseCode || body.course_code || "").trim().toUpperCase();
  const courseName = String(body.courseName || body.course_name || "").trim();
  const examType = String(body.examType || body.exam_type || "").trim().toUpperCase();
  const academicYear = String(body.academicYear || body.academic_year || "").trim();
  const semester = String(body.semester || "").trim();
  const batch = String(body.batch || "").trim();

  if (!department) throw Object.assign(new Error("Department is required"), { statusCode: 400 });
  if (!courseCode) throw Object.assign(new Error("Course code is required"), { statusCode: 400 });
  if (!courseName) throw Object.assign(new Error("Course name is required"), { statusCode: 400 });
  if (!EXAM_TYPES.has(examType)) {
    throw Object.assign(new Error("Exam type must be CAT1, CAT2, or SEM"), { statusCode: 400 });
  }
  if (!academicYear) throw Object.assign(new Error("Academic year is required"), { statusCode: 400 });
  if (!semester) throw Object.assign(new Error("Semester is required"), { statusCode: 400 });
  if (!batch) throw Object.assign(new Error("Batch is required"), { statusCode: 400 });

  return { department, courseCode, courseName, examType, academicYear, semester, batch };
}

function collectFolderFiles(files = {}) {
  const list = [];
  if (Array.isArray(files.folder)) list.push(...files.folder);
  if (Array.isArray(files.files)) list.push(...files.files);
  return list;
}

function assertPdfFolder(files = []) {
  if (!files.length) {
    throw Object.assign(new Error("Select a folder with at least one PDF"), { statusCode: 400 });
  }
  if (files.length > MAX_FOLDER_FILES) {
    throw Object.assign(new Error(`Folder may contain at most ${MAX_FOLDER_FILES} files`), {
      statusCode: 400,
    });
  }
  const pdfs = [];
  for (const file of files) {
    const name = String(file.originalname || "").toLowerCase();
    const mime = String(file.mimetype || "").toLowerCase();
    if (mime !== "application/pdf" && !name.endsWith(".pdf")) {
      // Skip non-PDFs silently (browser folder pick includes other files)
      continue;
    }
    if ((file.size || 0) > MAX_PDF_BYTES) {
      throw Object.assign(new Error(`Each PDF must be 15MB or smaller (${file.originalname})`), {
        statusCode: 400,
      });
    }
    pdfs.push(file);
  }
  if (!pdfs.length) {
    throw Object.assign(new Error("Selected folder has no PDF files"), { statusCode: 400 });
  }
  return pdfs;
}

function sanitizeRelativePath(raw) {
  const cleaned = String(raw || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((p) => p && p !== "." && p !== "..")
    .join("/");
  return cleaned || "file.pdf";
}

function folderNameFromFiles(files = []) {
  const first = files[0];
  const rel = String(first?.originalname || "").replace(/\\/g, "/");
  // multer may only have basename; frontend can send folderName in body
  if (rel.includes("/")) return rel.split("/")[0];
  return null;
}

async function listFilesForDocumentIds(docIds) {
  if (!docIds.length) return new Map();
  try {
    const placeholders = docIds.map(() => "?").join(", ");
    const [rows] = await db.query(
      `SELECT * FROM qpak_files WHERE document_id IN (${placeholders}) ORDER BY relative_path ASC`,
      docIds
    );
    const map = new Map();
    for (const row of rows || []) {
      const id = row.document_id ?? row.documentid;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(toFileRow(row));
    }
    return map;
  } catch (err) {
    // Table may not exist yet on first boot before ensure schema finishes.
    console.error("listFilesForDocumentIds:", err?.message || err);
    return new Map();
  }
}

function safeDownloadFilename(name) {
  const base = path.basename(String(name || "document.pdf").replace(/\\/g, "/"));
  const cleaned = base.replace(/[^\w.\-()+ ]+/g, "_").trim() || "document.pdf";
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`;
}

function moveUploadedFile(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err?.code !== "EXDEV") throw err;
    fs.copyFileSync(src, dest);
    try {
      fs.unlinkSync(src);
    } catch {
      /* ignore */
    }
  }
}

async function replaceFolderFiles(documentId, docUuid, folderFiles, folderName) {
  const [existing] = await db.query(`SELECT stored_path FROM qpak_files WHERE document_id = ?`, [
    documentId,
  ]);
  for (const row of existing || []) {
    const abs = absoluteFromRelative(row.stored_path ?? row.storedpath);
    if (abs && fs.existsSync(abs)) {
      try {
        fs.unlinkSync(abs);
      } catch {
        /* ignore */
      }
    }
  }
  await db.query(`DELETE FROM qpak_files WHERE document_id = ?`, [documentId]);

  const dir = path.join(UPLOAD_ROOT, docUuid);
  fs.mkdirSync(dir, { recursive: true });

  let index = 0;
  for (const file of folderFiles) {
    index += 1;
    const relativePath = sanitizeRelativePath(file.originalname);
    const safeName = `${String(index).padStart(3, "0")}_${path.basename(relativePath)}`.replace(
      /[^\w.\-()+ ]/g,
      "_"
    );
    const dest = path.join(dir, safeName);
    moveUploadedFile(file.path, dest);
    const storedPath = path.posix.join("qpak", String(docUuid), safeName);
    await db.query(
      `INSERT INTO qpak_files (document_id, relative_path, stored_path, original_name, file_size)
       VALUES (?, ?, ?, ?, ?)`,
      [
        documentId,
        relativePath,
        storedPath,
        path.basename(relativePath),
        file.size || 0,
      ]
    );
  }

  await db.query(
    `UPDATE qpak_documents SET folder_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [folderName || null, documentId]
  );
}

function absoluteFromRelative(relativePath) {
  if (!relativePath) return null;
  const safe = String(relativePath).replace(/\\/g, "/");
  if (!safe.startsWith("qpak/") || safe.includes("..")) return null;
  return path.join(__dirname, "..", "uploads", ...safe.split("/"));
}

function canManage(row, user) {
  if (!row || !user) return false;
  if (user.role === "admin") return true;
  if (user.role !== "faculty_incharge") return false;
  return Number(row.faculty_incharge_id ?? row.facultyinchargeid) === Number(user.id);
}

const QpakService = {
  EXAM_TYPES: ["CAT1", "CAT2", "SEM"],
  toManageRow,
  toPublicRow,

  listPublished: async (query = {}) => {
    const filters = normalizeFilters(query);
    let sql = `
      SELECT *
      FROM qpak_documents
      WHERE 1=1
    `;
    const params = [];
    ({ sql, params } = applyFilters(sql, params, filters, { publishedOnly: true }));
    sql += ` ORDER BY department ASC, course_code ASC, exam_type ASC, COALESCE(published_at, created_at) DESC`;
    const [rows] = await db.query(sql, params);
    const ids = (rows || []).map((r) => r.id);
    const fileMap = await listFilesForDocumentIds(ids);
    return (rows || []).map((r) => toPublicRow(r, fileMap.get(r.id) || []));
  },

  getFilterOptions: async () => {
    const [rows] = await db.query(
      `SELECT DISTINCT department, course_code, course_name, exam_type,
              academic_year, semester, batch
       FROM qpak_documents
       WHERE deleted_at IS NULL AND status = 'PUBLISHED'
       ORDER BY department, course_code`
    );
    const departments = new Set();
    const courses = [];
    const examTypes = new Set();
    const years = new Set();
    const semesters = new Set();
    const batches = new Set();
    for (const r of rows || []) {
      if (r.department) departments.add(r.department);
      courses.push({
        code: r.course_code ?? r.coursecode,
        name: r.course_name ?? r.coursename,
        department: r.department,
      });
      if (r.exam_type ?? r.examtype) examTypes.add(r.exam_type ?? r.examtype);
      if (r.academic_year ?? r.academicyear) years.add(r.academic_year ?? r.academicyear);
      if (r.semester) semesters.add(String(r.semester));
      if (r.batch) batches.add(r.batch);
    }
    const uniqueCourses = [];
    const seen = new Set();
    for (const c of courses) {
      const key = `${c.department}|${c.code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueCourses.push(c);
    }
    return {
      departments: [...departments].sort(),
      courses: uniqueCourses,
      examTypes: [...examTypes].sort(),
      years: [...years].sort().reverse(),
      semesters: [...semesters].sort(),
      batches: [...batches].sort(),
    };
  },

  listManaged: async (user, query = {}) => {
    const filters = normalizeFilters(query);
    let sql = `
      SELECT d.*, u.username AS uploader_name
      FROM qpak_documents d
      LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.deleted_at IS NULL
    `;
    const params = [];
    if (user.role === "faculty_incharge") {
      sql += ` AND d.faculty_incharge_id = ?`;
      params.push(user.id);
    } else if (user.role !== "admin") {
      return [];
    }

    if (filters.status && STATUSES.has(filters.status)) {
      sql += ` AND d.status = ?`;
      params.push(filters.status);
    }
    if (filters.dept) {
      sql += ` AND UPPER(d.department) = UPPER(?)`;
      params.push(filters.dept);
    }
    if (filters.course) {
      sql += ` AND UPPER(d.course_code) = UPPER(?)`;
      params.push(filters.course);
    }
    if (filters.courseName) {
      sql += ` AND d.course_name ILIKE ?`;
      params.push(`%${filters.courseName}%`);
    }
    if (filters.exam) {
      sql += ` AND d.exam_type = ?`;
      params.push(filters.exam);
    }
    if (filters.year) {
      sql += ` AND d.academic_year = ?`;
      params.push(filters.year);
    }
    if (filters.semester) {
      sql += ` AND d.semester = ?`;
      params.push(filters.semester);
    }
    if (filters.batch) {
      sql += ` AND d.batch ILIKE ?`;
      params.push(`%${filters.batch}%`);
    }
    if (filters.search) {
      sql += ` AND (
        d.course_code ILIKE ? OR d.course_name ILIKE ? OR d.department ILIKE ?
        OR d.batch ILIKE ? OR d.academic_year ILIKE ?
      )`;
      const q = `%${filters.search}%`;
      params.push(q, q, q, q, q);
    }

    sql += ` ORDER BY d.updated_at DESC`;
    const [rows] = await db.query(sql, params);
    const ids = (rows || []).map((r) => r.id);
    const fileMap = await listFilesForDocumentIds(ids);
    return (rows || []).map((r) => toManageRow(r, fileMap.get(r.id) || []));
  },

  getByUuid: async (uuid, { requirePublished = false } = {}) => {
    const [rows] = await db.query(
      `SELECT d.*, u.username AS uploader_name
       FROM qpak_documents d
       LEFT JOIN users u ON u.id = d.uploaded_by
       WHERE d.public_uuid = ? AND d.deleted_at IS NULL
       LIMIT 1`,
      [uuid]
    );
    const row = rows[0];
    if (!row) return null;
    if (requirePublished && row.status !== "PUBLISHED") return null;
    return row;
  },

  create: async ({ body, files, user }) => {
    const meta = validateMeta(body);
    const folderFiles = assertPdfFolder(collectFolderFiles(files));
    const folderName =
      String(body.folderName || body.folder_name || "").trim() ||
      folderNameFromFiles(folderFiles) ||
      "Uploaded folder";

    const publishNow = String(body.publish || body.status || "").toUpperCase() === "PUBLISHED";
    const status = publishNow ? "PUBLISHED" : "DRAFT";
    const ownerId = user.id;

    const [inserted] = await db.query(
      `INSERT INTO qpak_documents (
         department, course_code, course_name, exam_type, academic_year, semester, batch,
         folder_name, status, uploaded_by, faculty_incharge_id, published_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, public_uuid`,
      [
        meta.department,
        meta.courseCode,
        meta.courseName,
        meta.examType,
        meta.academicYear,
        meta.semester,
        meta.batch,
        folderName,
        status,
        ownerId,
        ownerId,
        status === "PUBLISHED" ? new Date() : null,
      ]
    );
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    const id = row?.id;
    const uuid = row?.public_uuid ?? row?.publicuuid;
    if (!id || !uuid) {
      throw Object.assign(new Error("Failed to create QPAK document"), { statusCode: 500 });
    }

    await replaceFolderFiles(id, uuid, folderFiles, folderName);
    const created = await QpakService.getByUuid(uuid);
    const fileMap = await listFilesForDocumentIds([id]);
    return toManageRow(created, fileMap.get(id) || []);
  },

  update: async (uuid, { body, files, user }) => {
    const existing = await QpakService.getByUuid(uuid);
    if (!existing) {
      throw Object.assign(new Error("Document not found"), { statusCode: 404 });
    }
    if (!canManage(existing, user)) {
      throw Object.assign(new Error("You do not have permission to modify this data."), {
        statusCode: 403,
      });
    }

    const meta = validateMeta({
      department: body.department ?? existing.department,
      courseCode: body.courseCode ?? body.course_code ?? existing.course_code ?? existing.coursecode,
      courseName: body.courseName ?? body.course_name ?? existing.course_name ?? existing.coursename,
      examType: body.examType ?? body.exam_type ?? existing.exam_type ?? existing.examtype,
      academicYear:
        body.academicYear ?? body.academic_year ?? existing.academic_year ?? existing.academicyear,
      semester: body.semester ?? existing.semester,
      batch: body.batch ?? existing.batch,
    });

    const incoming = collectFolderFiles(files);
    const folderFiles = incoming.length ? assertPdfFolder(incoming) : null;
    const folderName =
      String(body.folderName || body.folder_name || "").trim() ||
      (folderFiles ? folderNameFromFiles(folderFiles) : null) ||
      existing.folder_name ||
      existing.foldername;

    let status = existing.status;
    let publishedAt = existing.published_at ?? existing.publishedat;
    if (body.status != null) {
      const next = String(body.status).toUpperCase();
      if (!STATUSES.has(next)) {
        throw Object.assign(new Error("Invalid status"), { statusCode: 400 });
      }
      status = next;
      if (status === "PUBLISHED" && existing.status !== "PUBLISHED") publishedAt = new Date();
      if (status === "DRAFT") publishedAt = null;
    }

    if (folderFiles) {
      await replaceFolderFiles(existing.id, uuid, folderFiles, folderName);
    }

    const fileMap = await listFilesForDocumentIds([existing.id]);
    const fileCount = (fileMap.get(existing.id) || []).length;
    if (status === "PUBLISHED" && fileCount === 0) {
      throw Object.assign(new Error("Cannot publish without folder files"), { statusCode: 400 });
    }

    await db.query(
      `UPDATE qpak_documents
       SET department = ?, course_code = ?, course_name = ?, exam_type = ?,
           academic_year = ?, semester = ?, batch = ?, folder_name = COALESCE(?, folder_name),
           status = ?, published_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE public_uuid = ? AND deleted_at IS NULL`,
      [
        meta.department,
        meta.courseCode,
        meta.courseName,
        meta.examType,
        meta.academicYear,
        meta.semester,
        meta.batch,
        folderName,
        status,
        publishedAt,
        uuid,
      ]
    );

    const updated = await QpakService.getByUuid(uuid);
    const filesAfter = await listFilesForDocumentIds([updated.id]);
    return toManageRow(updated, filesAfter.get(updated.id) || []);
  },

  setStatus: async (uuid, status, user) => {
    const existing = await QpakService.getByUuid(uuid);
    if (!existing) {
      throw Object.assign(new Error("Document not found"), { statusCode: 404 });
    }
    if (!canManage(existing, user)) {
      throw Object.assign(new Error("You do not have permission to modify this data."), {
        statusCode: 403,
      });
    }
    const next = String(status || "").toUpperCase();
    if (!STATUSES.has(next)) {
      throw Object.assign(new Error("Invalid status"), { statusCode: 400 });
    }
    if (next === "PUBLISHED") {
      const fileMap = await listFilesForDocumentIds([existing.id]);
      if (!(fileMap.get(existing.id) || []).length) {
        throw Object.assign(new Error("Cannot publish without folder files"), { statusCode: 400 });
      }
    }
    await db.query(
      `UPDATE qpak_documents
       SET status = ?,
           published_at = CASE WHEN ? = 'PUBLISHED' THEN COALESCE(published_at, CURRENT_TIMESTAMP) ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE public_uuid = ? AND deleted_at IS NULL`,
      [next, next, uuid]
    );
    const updated = await QpakService.getByUuid(uuid);
    const filesAfter = await listFilesForDocumentIds([updated.id]);
    return toManageRow(updated, filesAfter.get(updated.id) || []);
  },

  softDelete: async (uuid, user) => {
    const existing = await QpakService.getByUuid(uuid);
    if (!existing) {
      throw Object.assign(new Error("Document not found"), { statusCode: 404 });
    }
    if (!canManage(existing, user)) {
      throw Object.assign(new Error("You do not have permission to modify this data."), {
        statusCode: 403,
      });
    }
    await db.query(
      `UPDATE qpak_documents
       SET deleted_at = CURRENT_TIMESTAMP, status = 'DRAFT', updated_at = CURRENT_TIMESTAMP
       WHERE public_uuid = ?`,
      [uuid]
    );
    return { deleted: true };
  },

  resolveFileByUuid: async (docUuid, fileUuid, { requirePublished = false, user = null } = {}) => {
    const doc = await QpakService.getByUuid(docUuid, { requirePublished });
    if (!doc) {
      throw Object.assign(new Error("Document not found"), { statusCode: 404 });
    }
    if (!requirePublished && doc.status !== "PUBLISHED") {
      if (!user || !canManage(doc, user)) {
        throw Object.assign(new Error("You do not have permission to modify this data."), {
          statusCode: 403,
        });
      }
    }
    const [rows] = await db.query(
      `SELECT * FROM qpak_files WHERE public_uuid = ? AND document_id = ? LIMIT 1`,
      [fileUuid, doc.id]
    );
    const file = rows[0];
    if (!file) {
      throw Object.assign(new Error("File not found"), { statusCode: 404 });
    }
    const abs = absoluteFromRelative(file.stored_path ?? file.storedpath);
    if (!abs || !fs.existsSync(abs)) {
      throw Object.assign(new Error("File not found"), { statusCode: 404 });
    }
    return {
      absolutePath: abs,
      downloadName: safeDownloadFilename(
        file.original_name ?? file.originalname ?? path.basename(abs)
      ),
      mime: "application/pdf",
    };
  },
};

module.exports = QpakService;
module.exports.safeDownloadFilename = safeDownloadFilename;
