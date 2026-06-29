const Api = require("../utils/apiResponse");
const PublicId = require("../utils/publicId");

/**
 * Resolve :uuid (or legacy :id) route param to req.internalId.
 * Invalid or unknown identifiers return 404 (no enumeration hints).
 */
function resolveEntity(table, options = {}) {
  const {
    paramKey = "uuid",
    legacyParamKey = "id",
    reqKey = "internalId",
    allowLegacyNumeric = true,
  } = options;

  return async (req, res, next) => {
    try {
      const raw = req.params[paramKey] ?? req.params[legacyParamKey];
      if (!raw) {
        return Api.notFound(res, "Not found");
      }

      if (!PublicId.isValidUuid(raw) && !allowLegacyNumeric) {
        return Api.notFound(res, "Not found");
      }

      if (
        !PublicId.isValidUuid(raw) &&
        !PublicId.isLegacyNumericId(raw)
      ) {
        return Api.notFound(res, "Not found");
      }

      const internalId = await PublicId.resolveInternalId(table, raw, {
        allowLegacyNumeric,
      });

      if (!internalId) {
        return Api.notFound(res, "Not found");
      }

      req[reqKey] = internalId;
      if (PublicId.isValidUuid(raw)) {
        req.publicUuid = raw;
      } else {
        req.publicUuid = await PublicId.getPublicUuid(table, internalId);
      }

      if (
        allowLegacyNumeric &&
        PublicId.isLegacyNumericId(raw) &&
        req.publicUuid &&
        req.method === "GET"
      ) {
        const base = req.baseUrl + req.route.path.replace(`:${legacyParamKey}`, req.publicUuid);
        const suffix = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
        const redirectPath = base.replace(`:${paramKey}`, req.publicUuid) + suffix;
        return res.redirect(308, redirectPath);
      }

      next();
    } catch (err) {
      return Api.serverError(res, err, "resolveEntity");
    }
  };
}

module.exports = { resolveEntity };
