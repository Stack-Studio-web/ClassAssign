/**
 * Redis-backed session store (replaces in-memory Map).
 * Session TTL: SESSION_TTL_SECONDS (default 24h).
 */
const Redis = require("ioredis");

const SESSION_PREFIX = "sess:";
const OAUTH_STATE_PREFIX = "oauth:state:";
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS) || 24 * 60 * 60;
const OAUTH_STATE_TTL_SECONDS = 600;

let redisClient = null;

function parseRedisUrl(url) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: parseInt(u.port, 10) || 6379,
      password: u.password || undefined,
      db: parseInt(u.pathname.slice(1), 10) || 1,
    };
  } catch {
    return { host: process.env.REDIS_HOST || "redis", port: 6379, db: 1 };
  }
}

function getRedis() {
  if (redisClient) return redisClient;
  const url = process.env.REDIS_URL || process.env.CELERY_BROKER_URL;
  const opts = url ? parseRedisUrl(url) : parseRedisUrl("redis://redis:6379/1");
  if (url && !process.env.REDIS_SESSION_DB) {
    opts.db = 1;
  }
  redisClient = new Redis({
    ...opts,
    maxRetriesPerRequest: 3,
  });
  redisClient.on("error", (err) => {
    console.error("Redis session error:", err.message);
  });
  return redisClient;
}

async function connectSessionStore() {
  const client = getRedis();
  await client.ping();
  console.log("Redis session store connected");
}

function sessionKey(token) {
  return `${SESSION_PREFIX}${token}`;
}

const SessionStore = {
  connect: connectSessionStore,

  async set(token, session) {
    const payload = JSON.stringify({ ...session, createdAt: session.createdAt || Date.now() });
    await getRedis().setex(sessionKey(token), SESSION_TTL_SECONDS, payload);
  },

  async get(token) {
    if (!token) return null;
    const raw = await getRedis().get(sessionKey(token));
    if (!raw) return null;
    try {
      const session = JSON.parse(raw);
      const age = Date.now() - (session.createdAt || 0);
      if (age > SESSION_TTL_SECONDS * 1000) {
        await SessionStore.delete(token);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  },

  async delete(token) {
    if (!token) return;
    await getRedis().del(sessionKey(token));
  },

  async touch(token) {
    const session = await SessionStore.get(token);
    if (session) {
      await SessionStore.set(token, session);
    }
  },

  async setOAuthState(state, payload = { platform: "web" }) {
    const body =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    await getRedis().setex(
      `${OAUTH_STATE_PREFIX}${state}`,
      OAUTH_STATE_TTL_SECONDS,
      body
    );
  },

  async consumeOAuthState(state) {
    if (!state) return null;
    const key = `${OAUTH_STATE_PREFIX}${state}`;
    const val = await getRedis().get(key);
    if (!val) return null;
    await getRedis().del(key);
    try {
      const parsed = JSON.parse(val);
      return typeof parsed === "object" && parsed !== null
        ? parsed
        : { platform: "web" };
    } catch {
      return { platform: "web" };
    }
  },
};

module.exports = SessionStore;
