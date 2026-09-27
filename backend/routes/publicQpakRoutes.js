const express = require("express");
const path = require("path");
const router = express.Router();
const Api = require("../utils/apiResponse");
const QpakService = require("../services/qpakService");
const ensureQpakSchema = require("../utils/ensureQpakSchema");

const EMPTY_FILTERS = {
  departments: [],
  courses: [],
  examTypes: ["CAT1", "CAT2", "SEM"],
  years: [],
  semesters: [],
  batches: [],
};

function setPdfHeaders(res, downloadName, asDownload) {
  const safe =
    typeof QpakService.safeDownloadFilename === "function"
      ? QpakService.safeDownloadFilename(downloadName)
      : path.basename(String(downloadName || "document.pdf").replace(/\\/g, "/"));
  const disposition = asDownload ? "attachment" : "inline";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function errorDetail(err) {
  return (
    err?.parent?.message ||
    err?.original?.message ||
    err?.message ||
    String(err)
  );
}

router.get("/", async (req, res) => {
  try {
    await ensureQpakSchema();
  } catch (schemaErr) {
    console.error("ensureQpakSchema before public list:", errorDetail(schemaErr));
  }

  try {
    const [documents, filters] = await Promise.all([
      QpakService.listPublished(req.query),
      QpakService.getFilterOptions(),
    ]);
    return Api.success(res, "Published QPAK documents", { documents, filters });
  } catch (err) {
    const detail = errorDetail(err);
    console.error("GET /public/qpak failed:", detail);
    // Prefer a working empty page over a hard 500 while schema/data catches up.
    return Api.success(
      res,
      "Published QPAK documents",
      { documents: [], filters: EMPTY_FILTERS, warning: detail },
      200
    );
  }
});

router.get("/filters", async (_req, res) => {
  try {
    await ensureQpakSchema();
    const filters = await QpakService.getFilterOptions();
    return Api.success(res, "QPAK filter options", { filters });
  } catch (err) {
    return Api.success(res, "QPAK filter options", {
      filters: EMPTY_FILTERS,
      warning: errorDetail(err),
    });
  }
});

router.get("/:uuid/files/:fileUuid", async (req, res) => {
  try {
    const file = await QpakService.resolveFileByUuid(req.params.uuid, req.params.fileUuid, {
      requirePublished: true,
    });
    setPdfHeaders(res, file.downloadName, req.query.download === "1");
    return res.sendFile(path.resolve(file.absolutePath), (sendErr) => {
      if (sendErr && !res.headersSent) {
        console.error("QPAK sendFile failed:", sendErr?.message || sendErr);
        return Api.fromError(
          res,
          Object.assign(new Error("File not found"), { statusCode: 404 })
        );
      }
    });
  } catch (err) {
    return Api.fromError(res, err);
  }
});

module.exports = router;
