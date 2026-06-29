const SessionStore = require("../utils/sessionStore");
const { getTokenFromRequest } = require("../utils/cookieAuth");

const SESSION_MAX_AGE_MS = Number(process.env.SESSION_TTL_SECONDS || 86400) * 1000;

module.exports = async function sessionAuth(req, res, next) {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({ error: "Authorization required" });
    }

    const session = await SessionStore.get(token);

    if (!session) {
      return res.status(401).json({
        error: "Invalid or expired session",
        hint: "Please log in again",
      });
    }

    const sessionAge = Date.now() - (session.createdAt || 0);
    if (sessionAge > SESSION_MAX_AGE_MS) {
      await SessionStore.delete(token);
      return res.status(401).json({ error: "Session expired" });
    }

    req.session = session;
    req.authToken = token;
    req.user = {
      id: session.userId,
      publicUuid: session.publicUuid,
      email: session.email,
      role: session.role,
      username: session.username,
      department: session.department,
    };

    await SessionStore.touch(token);
    next();
  } catch (err) {
    console.error("sessionAuth error:", err.message);
    res.status(500).json({ error: "Authentication failed" });
  }
};
