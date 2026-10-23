/**
 * Login rate-limiter keying and policy regression checks.
 * Run: node backend/scripts/validateLoginRateLimiter.mjs
 */
import assert from "assert";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  buildLoginRateLimitKey,
  LOGIN_RATE_LIMIT,
} = require("../middleware/rateLimiters.js");

function testKeyUsesIpStringNotRequestObject() {
  const reqA = { ip: "203.0.113.10", body: { email: "a@kct.ac.in" } };
  const reqB = { ip: "203.0.113.11", body: { email: "a@kct.ac.in" } };
  const keyA = buildLoginRateLimitKey(reqA);
  const keyB = buildLoginRateLimitKey(reqB);
  assert.notStrictEqual(keyA, keyB, "different IPs must not share a bucket");
  assert.ok(!keyA.includes("[object Object]"), "must not coerce req into key");
  assert.ok(keyA.includes("login"), "suffix present");
  assert.ok(keyA.toLowerCase().includes("a@kct.ac.in"), "email included when present");
}

function testSharedIpDifferentAccountsAreIsolated() {
  const ip = "198.51.100.20";
  const key1 = buildLoginRateLimitKey({
    ip,
    body: { email: "faculty1@kct.ac.in" },
  });
  const key2 = buildLoginRateLimitKey({
    ip,
    body: { email: "faculty2@kct.ac.in" },
  });
  assert.notStrictEqual(
    key1,
    key2,
    "shared campus IP must not lock unrelated accounts together"
  );
}

function testMissingEmailFallsBackToIp() {
  const key = buildLoginRateLimitKey({ ip: "192.0.2.5", body: {} });
  assert.ok(key.endsWith(":login") || key.includes(":login"));
  assert.ok(!key.includes("undefined"));
}

function testPolicyKeepsBruteForceProtection() {
  assert.strictEqual(LOGIN_RATE_LIMIT.windowMs, 15 * 60 * 1000);
  assert.strictEqual(LOGIN_RATE_LIMIT.max, 20);
  assert.strictEqual(LOGIN_RATE_LIMIT.skipSuccessfulRequests, true);
  // Successful auth must not burn the failed-attempt budget; still capped.
  assert.notStrictEqual(LOGIN_RATE_LIMIT.max, Number.POSITIVE_INFINITY);
  assert.ok(LOGIN_RATE_LIMIT.max > 0 && LOGIN_RATE_LIMIT.max <= 50);
}

function testLegacyBugWouldHaveCollapsedAllClients() {
  // Document the historical bug: ipKeyGenerator(req) → String(req) === "[object Object]"
  const bogus = `${String({ ip: "1.2.3.4" })}:login`;
  assert.strictEqual(bogus, "[object Object]:login");
  const fixed = buildLoginRateLimitKey({ ip: "1.2.3.4", body: { email: "x@y.z" } });
  assert.notStrictEqual(fixed, "[object Object]:login");
}

testKeyUsesIpStringNotRequestObject();
testSharedIpDifferentAccountsAreIsolated();
testMissingEmailFallsBackToIp();
testPolicyKeepsBruteForceProtection();
testLegacyBugWouldHaveCollapsedAllClients();

console.log("✅ Login rate limiter regression checks passed");
