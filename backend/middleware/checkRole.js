const checkRole = (allowedRoles) => {
    return (req, res, next) => {
      // req.user is populated by sessionAuth
      if (!req.user || !allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ 
          error: "Access denied", 
          details: "You do not have permission to perform this action." 
        });
      }
      next();
    };
  };
  module.exports = checkRole;