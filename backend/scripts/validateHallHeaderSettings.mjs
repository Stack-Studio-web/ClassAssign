/**
 * Per-user /hall header configuration (logo, department, program1, program2).
 * Run: node backend/scripts/validateHallHeaderSettings.mjs
 */
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const HallHeaderSettings = require("../services/hallHeaderSettings.js");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function testNormalizeAndParse() {
  assert.strictEqual(HallHeaderSettings.normalizeLogo("ksi"), "KSI");
  assert.strictEqual(HallHeaderSettings.normalizeLogo("KCT"), "KCT");
  assert.throws(() => HallHeaderSettings.normalizeLogo("OTHER"), /Logo must be KCT or KSI/);

  const parsed = HallHeaderSettings.parseBody({
    logo: "KSI",
    department: "Department of SFS",
    program1: "SFS program configuration",
    program2: "Another SFS program configuration",
  });
  assert.deepStrictEqual(parsed, {
    logo: "KSI",
    department: "Department of SFS",
    program1: "SFS program configuration",
    program2: "Another SFS program configuration",
  });

  const empty = HallHeaderSettings.toConfig(null);
  assert.strictEqual(empty.saved, false);
  assert.strictEqual(empty.logo, HallHeaderSettings.DEFAULTS.logo);
  assert.strictEqual(empty.department, HallHeaderSettings.DEFAULTS.department);
  console.log("✓ normalize / parse / defaults");
}

function testInMemoryUserIsolation() {
  /** Simulate one-row-per-user store (mirrors UNIQUE(user_id) upsert semantics). */
  const store = new Map();

  function upsert(userId, body) {
    const parsed = HallHeaderSettings.parseBody(body);
    store.set(Number(userId), { ...parsed });
    return { ...parsed, saved: true };
  }

  function get(userId) {
    const row = store.get(Number(userId));
    return HallHeaderSettings.toConfig(row || null);
  }

  const user1 = 101;
  const user2 = 202;

  upsert(user1, {
    logo: "KCT",
    department: "Department of CSE, IT, AI, etc.",
    program1: "BE CSE - B.Tech IT - B.Tech ...",
    program2: "M.Tech DS - M.E CSE (Cyber...)",
  });

  upsert(user2, {
    logo: "KCT",
    department: "Department of SFS",
    program1: "SFS program configuration",
    program2: "Another SFS program configuration",
  });

  const u1 = get(user1);
  const u2 = get(user2);

  assert.strictEqual(u1.department, "Department of CSE, IT, AI, etc.");
  assert.strictEqual(u1.program1, "BE CSE - B.Tech IT - B.Tech ...");
  assert.strictEqual(u2.department, "Department of SFS");
  assert.strictEqual(u2.program1, "SFS program configuration");

  // Saving user 2 again must not mutate user 1
  upsert(user2, {
    logo: "KSI",
    department: "Department of SFS (updated)",
    program1: "SFS P1 updated",
    program2: "SFS P2 updated",
  });

  const u1After = get(user1);
  const u2After = get(user2);
  assert.strictEqual(u1After.department, "Department of CSE, IT, AI, etc.");
  assert.strictEqual(u1After.logo, "KCT");
  assert.strictEqual(u2After.department, "Department of SFS (updated)");
  assert.strictEqual(u2After.logo, "KSI");
  assert.notStrictEqual(u1After.department, u2After.department);
  console.log("✓ user1 KSI/CSE config isolated from user2 SFS config");
}

function testSchemaAndApiWiring() {
  const migration = read("backend/databasemigration/046_hall_header_settings.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS hall_header_settings/);
  assert.match(migration, /UNIQUE\s*\(\s*user_id\s*\)/);
  assert.match(migration, /logo/);
  assert.match(migration, /department/);
  assert.match(migration, /program1/);
  assert.match(migration, /program2/);

  const ensure = read("backend/utils/ensureHallHeaderSettingsSchema.js");
  assert.match(ensure, /hall_header_settings_user_unique/);

  const routes = read("backend/routes/hallHeaderRoutes.js");
  assert.match(routes, /req\.user\.id/);
  assert.match(routes, /HallHeaderSettings\.getForUser\(req\.user\.id\)/);
  assert.match(routes, /HallHeaderSettings\.upsertForUser\(req\.user\.id/);
  assert.doesNotMatch(routes, /req\.body\.userId|req\.params\.userId|req\.query\.userId/);
  assert.match(routes, /sessionAuth/);
  assert.match(routes, /checkRole/);

  const server = read("backend/server.js");
  assert.match(server, /\/api\/hall-header/);
  assert.match(server, /ensureHallHeaderSettingsSchema/);

  const boot = read("backend/scripts/lib/testDatabase.js");
  assert.match(boot, /ensureHallHeaderSettingsSchema/);
  console.log("✓ schema migration + API uses session user id only");
}

function testFrontendWiring() {
  const page = read("src/pages/StudentArrangement.jsx");
  assert.match(page, /api\.get\("\/hall-header"\)/);
  assert.match(page, /api\.put\("\/hall-header"/);
  assert.match(page, /handleSaveHeader/);
  assert.match(page, /headerHydrated/);
  assert.doesNotMatch(page, /localStorage\.getItem\("kctLogoType"\)/);
  assert.doesNotMatch(page, /localStorage\.setItem\("kctLogoType"/);

  // Chronological grouping kept; classic old PDF layout (page-break-inside-avoid)
  assert.match(page, /groupHallsByExamTime/);
  assert.match(page, /sortHallsForExport/);
  assert.match(page, /page-break-inside-avoid/);
  assert.match(page, /width=\{240\}/);
  assert.match(page, /Export as PDF/);
  assert.doesNotMatch(page, /paginateHallAllotmentForPrint/);
  console.log("✓ /hall loads+saves per-user config; classic export layout; no shared localStorage");
}

function main() {
  testNormalizeAndParse();
  testInMemoryUserIsolation();
  testSchemaAndApiWiring();
  testFrontendWiring();
  console.log("\nAll hall header settings checks passed.");
}

main();
