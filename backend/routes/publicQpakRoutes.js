const express = require("express");
const path = require("path");
const router = express.Router();
const Api = require("../utils/apiResponse");
const QpakService = require("../services/qpakService");
const ensureQpakSchema = require("../utils/ensureQpakSchema");

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

function isMissingRelation(err) {
  const msg = String(err?.message || err?.parent?.message || "");
  return (
    err?.code === "42P01" ||
    /relation .* does not exist/i.test(msg) ||
    (/qpak_/i.test(msg) && /does not exist/i.test(msg))
  );
}

async function loadPublished(query) {
  const [documents, filters] = await Promise.all([
    QpakService.listPublished(query),
    QpakService.getFilterOptions(),
  ]);
  return { documents, filters };
}

router.get("/", async (req, res) => {
  try {
    let payload;
    try {
      payload = await loadPublished(req.query);
    } catch (err) {
      if (!isMissingRelation(err)) throw err;
      console.warn("QPAK schema missing on public list; ensuring…", err?.message || err);
      await ensureQpakSchema();
      payload = await loadPublished(req.query);
    }
    return Api.success(res, "Published QPAK documents", payload);
  } catch (err) {
    console.error("GET /public/qpak failed:", err?.message || err);
    return Api.fromError(res, err);
  }
});

router.get("/filters", async (_req, res) => {
  try {
    const filters = await QpakService.getFilterOptions();
    return Api.success(res, "QPAK filter options", { filters });
  } catch (err) {
    if (isMissingRelation(err)) {
      await ensureQpakSchema();
      try {
        const filters = await QpakService.getFilterOptions();
        return Api.success(res, "QPAK filter options", { filters });
      } catch (err2) {
        return Api.fromError(res, err2);
      }
    }
    return Api.fromError(res, err);
  }
});

router.get("/:uuid/files/:fileUuid", async (req, res) => {
  try {
    const file = await QpakService.resolveFileByUuid(req.params.uuid, req.params.fileUuid, {
      requirePublished: true,
    });
    setPdfHeaders(res, file.downloadName, req.query.download === "1");
    return res.sendFile(path.resolve(file.absolutePath), (err) => {
      if (err && !res.headersSent) {
        console.error("QPAK sendFile failed:", err?.message || err);
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
