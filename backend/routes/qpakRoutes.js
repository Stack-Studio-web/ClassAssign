const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const auditLogger = require("../middleware/auditLogger");
const Api = require("../utils/apiResponse");
const QpakService = require("../services/qpakService");

const tmpDir = path.join(__dirname, "..", "uploads", "tmp");
fs.mkdirSync(tmpDir, { recursive: true });

const upload = multer({
  dest: tmpDir,
  limits: { fileSize: 15 * 1024 * 1024, files: 40 },
});

const MANAGE_ROLES = ["admin", "faculty_incharge"];

const uploadFields = upload.fields([
  { name: "folder", maxCount: 40 },
  { name: "files", maxCount: 40 },
]);

function handleMulter(req, res, next) {
  uploadFields(req, res, (err) => {
    if (err) {
      return Api.validationError(res, err.message || "Upload failed");
    }
    next();
  });
}

router.get("/", sessionAuth, checkRole(MANAGE_ROLES), async (req, res) => {
  try {
    const documents = await QpakService.listManaged(req.user, req.query);
    return Api.success(res, "QPAK documents", { documents });
  } catch (err) {
    return Api.fromError(res, err);
  }
});

router.get("/meta/exam-types", sessionAuth, checkRole(MANAGE_ROLES), (_req, res) => {
  return Api.success(res, "Exam types", { examTypes: QpakService.EXAM_TYPES });
});

router.get("/:uuid", sessionAuth, checkRole(MANAGE_ROLES), async (req, res) => {
  try {
    const row = await QpakService.getByUuid(req.params.uuid);
    if (!row) return Api.notFound(res, "Document not found");
    if (req.user.role === "faculty_incharge") {
      const owner = Number(row.faculty_incharge_id ?? row.facultyinchargeid);
      if (owner !== Number(req.user.id)) {
        return Api.forbidden(res, "You do not have permission to modify this data.");
      }
    }
    const documents = await QpakService.listManaged(req.user, {});
    const document = documents.find((d) => d.uuid === req.params.uuid);
    return Api.success(res, "QPAK document", {
      document: document || QpakService.toManageRow(row, []),
    });
  } catch (err) {
    return Api.fromError(res, err);
  }
});

router.post(
  "/",
  sessionAuth,
  checkRole(MANAGE_ROLES),
  handleMulter,
  auditLogger("QPAK_CREATED", "QpakDocument"),
  async (req, res) => {
    try {
      const document = await QpakService.create({
        body: req.body,
        files: req.files,
        user: req.user,
      });
      return Api.success(res, "QPAK document created", { document }, 201);
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.put(
  "/:uuid",
  sessionAuth,
  checkRole(MANAGE_ROLES),
  handleMulter,
  auditLogger("QPAK_UPDATED", "QpakDocument"),
  async (req, res) => {
    try {
      const document = await QpakService.update(req.params.uuid, {
        body: req.body,
        files: req.files,
        user: req.user,
      });
      return Api.success(res, "QPAK document updated", { document });
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.post(
  "/:uuid/publish",
  sessionAuth,
  checkRole(MANAGE_ROLES),
  auditLogger("QPAK_PUBLISHED", "QpakDocument"),
  async (req, res) => {
    try {
      const document = await QpakService.setStatus(req.params.uuid, "PUBLISHED", req.user);
      return Api.success(res, "QPAK document published", { document });
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.post(
  "/:uuid/unpublish",
  sessionAuth,
  checkRole(MANAGE_ROLES),
  auditLogger("QPAK_UNPUBLISHED", "QpakDocument"),
  async (req, res) => {
    try {
      const document = await QpakService.setStatus(req.params.uuid, "DRAFT", req.user);
      return Api.success(res, "QPAK document unpublished", { document });
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.delete(
  "/:uuid",
  sessionAuth,
  checkRole(MANAGE_ROLES),
  auditLogger("QPAK_DELETED", "QpakDocument"),
  async (req, res) => {
    try {
      await QpakService.softDelete(req.params.uuid, req.user);
      return Api.success(res, "QPAK document deleted", { deleted: true });
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.get(
  "/:uuid/files/:fileUuid",
  sessionAuth,
  checkRole(MANAGE_ROLES),
  async (req, res) => {
    try {
      const file = await QpakService.resolveFileByUuid(req.params.uuid, req.params.fileUuid, {
        requirePublished: false,
        user: req.user,
      });
      res.setHeader("Content-Type", file.mime);
      const disposition = req.query.download === "1" ? "attachment" : "inline";
      res.setHeader(
        "Content-Disposition",
        `${disposition}; filename="${String(file.downloadName).replace(/"/g, "")}"`
      );
      return res.sendFile(file.absolutePath);
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

module.exports = router;
