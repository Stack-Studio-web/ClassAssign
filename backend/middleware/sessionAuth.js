const { sessions } = require("../routes/authRoutes");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "Authorization token missing" });
  }

  const session = sessions.get(token);

  if (!session) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  req.session = session;
  req.user = {
    id: session.userId,
    email: session.email,
    role: session.role,
    username: session.username,
    department: session.department,
  };

  next();
};