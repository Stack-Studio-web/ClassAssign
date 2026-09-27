const express = require("express");
const router = express.Router();
const Api = require("../utils/apiResponse");
const QpakService = require("../services/qpakService");

router.get("/", async (req, res) => {
  try {
    const [documents, filters] = await Promise.all([
      QpakService.listPublished(req.query),
      QpakService.getFilterOptions(),
    ]);
    return Api.success(res, "Published QPAK documents", { documents, filters });
  } catch (err) {
    return Api.fromError(res, err);
  }
});

router.get("/filters", async (_req, res) => {
  try {
    const filters = await QpakService.getFilterOptions();
    return Api.success(res, "QPAK filter options", { filters });
  } catch (err) {
    return Api.fromError(res, err);
  }
});

router.get("/:uuid/files/:fileUuid", async (req, res) => {
  try {
    const file = await QpakService.resolveFileByUuid(req.params.uuid, req.params.fileUuid, {
      requirePublished: true,
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
});

module.exports = router;
