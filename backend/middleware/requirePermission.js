const { hasPermission } = require("../utils/rbac");
const Api = require("../utils/apiResponse");

function requirePermission(...permissions) {
  return (req, res, next) => {
    const role = req.user?.role;
    const allowed = permissions.some((p) => hasPermission(role, p));
    if (!allowed) {
      return Api.forbidden(res, "You do not have permission to perform this action.");
    }
    next();
  };
}

module.exports = requirePermission;
