const crypto = require("crypto");
const SessionStore = require("../utils/sessionStore");
const {
  setSessionCookie,
  clearSessionCookie,
  getTokenFromRequest,
  isMobileClient,
} = require("../utils/cookieAuth");

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function createSession(res, req, sessionData) {
  const token = generateToken();
  const session = {
    ...sessionData,
    createdAt: Date.now(),
  };
  await SessionStore.set(token, session);
  setSessionCookie(res, token);
  return token;
}

async function destroySession(req, res) {
  const token = getTokenFromRequest(req);
  if (token) {
    await SessionStore.delete(token);
  }
  clearSessionCookie(res);
}

async function getSessionFromRequest(req) {
  const token = getTokenFromRequest(req);
  if (!token) return { token: null, session: null };
  const session = await SessionStore.get(token);
  return { token, session };
}

function attachAuthResponse(res, req, token, body) {
  if (isMobileClient(req)) {
    return res.status(200).json({ ...body, token });
  }
  return res.status(200).json(body);
}

module.exports = {
  generateToken,
  createSession,
  destroySession,
  getSessionFromRequest,
  attachAuthResponse,
  getTokenFromRequest,
};
