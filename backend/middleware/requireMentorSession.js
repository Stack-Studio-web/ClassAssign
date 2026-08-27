const SessionStore = require("../utils/sessionStore");
const { getTokenFromRequest } = require("../utils/cookieAuth");

const SESSION_MAX_AGE_MS = Number(process.env.SESSION_TTL_SECONDS || 86400) * 1000;

async function loadSession(req, res) {
  const token = getTokenFromRequest(req);

  if (!token) {
    res.status(401).json({ error: "Authorization required" });
    return null;
  }

  const session = await SessionStore.get(token);

  if (!session) {
    res.status(401).json({
      error: "Invalid or expired session",
      hint: "Please log in again",
    });
    return null;
  }

  const sessionAge = Date.now() - (session.createdAt || 0);
  if (sessionAge > SESSION_MAX_AGE_MS) {
    await SessionStore.delete(token);
    res.status(401).json({ error: "Session expired" });
    return null;
  }

  req.session = session;
  req.authToken = token;

  if (session.role === "mentor") {
    req.user = {
      id: session.mentorId,
      mentorId: session.mentorId,
      publicUuid: session.publicUuid,
      email: session.email,
      role: "mentor",
      username: session.username,
      department: session.department,
      mustChangePassword: session.mustChangePassword ?? false,
      hasAvatar: !!session.hasAvatar,
    };
  } else {
    req.user = {
      id: session.userId,
      publicUuid: session.publicUuid,
      email: session.email,
      role: session.role,
      username: session.username,
      department: session.department,
      hasAvatar: !!session.hasAvatar,
    };
  }

  await SessionStore.touch(token);
  return session;
}

module.exports = async function requireMentorSession(req, res, next) {
  try {
    const session = await loadSession(req, res);
    if (!session) return;
    if (session.role !== "mentor") {
      return res.status(403).json({
        error: "Mentor access required",
        message: "This endpoint is only available to authenticated mentors.",
      });
    }
    next();
  } catch (err) {
    console.error("requireMentorSession error:", err.message);
    res.status(500).json({ error: "Authentication failed" });
  }
};

module.exports.loadSession = loadSession;
