/**
 * Static checks for saved-report delete wiring (no DB required).
 * Run: node backend/scripts/validateSeatingPlanDeleteRoute.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const routes = read("backend/routes/seatingRoutes.js");
const report = read("src/pages/Report.jsx");
const resolveMw = read("backend/middleware/resolvePublicId.js");
const publicId = read("backend/utils/publicId.js");

assert(
  /router\.delete\(\s*[\s\S]*?"\/delete-plan\/:uuid"/.test(routes),
  "Expected DELETE /delete-plan/:uuid route"
);
assert(
  /notFoundMessage:\s*"Seating plan not found"/.test(routes),
  "Delete route should return a seating-plan-specific 404 message"
);
assert(
  /api\.delete\(`\/seating\/delete-plan\/\$\{encodeURIComponent\(planId\)\}`\)/.test(report),
  "Report.jsx must DELETE /seating/delete-plan/:uuid with encodeURIComponent"
);
assert(
  /plan\?\.uuid \|\| plan\?\.public_uuid \|\| plan\?\.publicUuid/.test(report),
  "Delete handler must read the plan public uuid from the card"
);
assert(
  /deleteInFlightRef/.test(report),
  "Delete handler must guard against double-submit"
);
assert(
  /setPlans\(\(prev\) => prev\.filter/.test(report),
  "Delete success must remove the card from local state immediately"
);
assert(
  !/Promise\.all\(\[\s*api\.get\("\/seating"/.test(report),
  "Report list refresh must not block on /faculty via Promise.all"
);
assert(
  /Lightweight existence \+ ownership check/.test(routes) ||
    /FROM seating_plans\s+WHERE id = \?/.test(routes),
  "Delete route must load seating_plans by id before deleting"
);
assert(
  /notFoundMessage/.test(resolveMw),
  "resolveEntity must support notFoundMessage"
);
assert(
  /WHERE public_uuid = \? LIMIT 1/.test(publicId),
  "resolveInternalId should look up seating_plans.public_uuid with bound ?"
);

const sampleUuid = "81d317ee-10d1-4dcc-9761-1a2ee9acf8d8";
const expectedPath = `/seating/delete-plan/${encodeURIComponent(sampleUuid)}`;
assert(
  expectedPath === `/seating/delete-plan/${sampleUuid}`,
  "Standard UUIDs must not change under encodeURIComponent"
);

console.log("validateSeatingPlanDeleteRoute: ok");
console.log("  DELETE endpoint: DELETE /api/seating/delete-plan/:uuid");
console.log(`  Example path:    ${expectedPath}`);
