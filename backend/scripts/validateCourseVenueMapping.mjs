/**
 * Manual allotment: per-course venue mapping (session-scoped).
 * Run: node backend/scripts/validateCourseVenueMapping.mjs
 */
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const {
  normalizeCourseVenueMappings,
  validateMappedCourseCapacity,
  validateSeatingHonorsMappings,
  resolveVenuesForCourse,
} = require("../utils/courseVenueMapping.js");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function testNormalizeAndResolve() {
  const raw = {
    "EG-MECH-A": ["v1", "v1", "v2"],
    "MATH-CSE-B": [],
    "": ["v9"],
  };
  const n = normalizeCourseVenueMappings(raw);
  assert.deepStrictEqual(n["EG-MECH-A"], ["v1", "v2"]);
  assert.strictEqual(n["MATH-CSE-B"], undefined);

  const mapped = resolveVenuesForCourse("EG-MECH-A", n, ["g1", "g2"]);
  assert.strictEqual(mapped.mode, "mapped");
  assert.deepStrictEqual(mapped.venueIds, ["v1", "v2"]);

  const general = resolveVenuesForCourse("MATH-CSE-B", n, ["g1", "g2"]);
  assert.strictEqual(general.mode, "general");
  assert.deepStrictEqual(general.venueIds, ["g1", "g2"]);
  console.log("✓ normalize + resolve: mapped vs general allotment");
}

function testCapacityFiveVenuesExample() {
  const venuesById = {
    sc314: { uuid: "sc314", name: "SC314", capacity: 70 },
    sc320: { uuid: "sc320", name: "SC320", capacity: 40 },
  };
  // EG mapped to SC314 — 50 students OK
  let r = validateMappedCourseCapacity({
    courseVenueMappings: { "EG-MECH-A": ["sc314"] },
    courseStudentCounts: { "EG-MECH-A": 50, "MATH-CSE-B": 30 },
    venuesById,
  });
  assert.strictEqual(r.ok, true);

  // EG mapped to SC314 — 80 students FAIL (no silent fallback)
  r = validateMappedCourseCapacity({
    courseVenueMappings: { "EG-MECH-A": ["sc314"] },
    courseStudentCounts: { "EG-MECH-A": 80 },
    venuesById,
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors[0].code, "INSUFFICIENT_MAPPED_CAPACITY");

  // Multi-venue mapping: SC314+SC320 = 110 ≥ 100
  r = validateMappedCourseCapacity({
    courseVenueMappings: { "EG-MECH-A": ["sc314", "sc320"] },
    courseStudentCounts: { "EG-MECH-A": 100 },
    venuesById,
  });
  assert.strictEqual(r.ok, true);
  console.log("✓ mapped capacity: single/multi venue; no silent fallback");
}

function testSessionScopedDifferentMappings() {
  // Same course code, different session keys — independent mappings
  const sessionFn = normalizeCourseVenueMappings({
    "EG-MECH-A": ["sc314"],
  });
  const sessionAn = normalizeCourseVenueMappings({
    "EG-MECH-A": ["sc320"],
  });
  assert.deepStrictEqual(sessionFn["EG-MECH-A"], ["sc314"]);
  assert.deepStrictEqual(sessionAn["EG-MECH-A"], ["sc320"]);
  console.log("✓ same course can map to SC314 vs SC320 across sessions (independent state)");
}

function testSeatingHonorsMappings() {
  const ok = validateSeatingHonorsMappings({
    courseVenueMappings: { "EG-MECH-A": ["sc314"] },
    venuesUsed: [
      {
        venueId: "sc314",
        venueName: "SC314",
        seatingArrangement: [
          [[{ regnNo: "1", courseEntryKey: "EG-MECH-A" }]],
        ],
      },
      {
        venueId: "sc320",
        venueName: "SC320",
        seatingArrangement: [
          [[{ regnNo: "2", courseEntryKey: "MATH-CSE-B" }]],
        ],
      },
    ],
  });
  assert.strictEqual(ok.ok, true);

  const bad = validateSeatingHonorsMappings({
    courseVenueMappings: { "EG-MECH-A": ["sc314"] },
    venuesUsed: [
      {
        venueId: "sc320",
        venueName: "SC320",
        seatingArrangement: [
          [[{ regnNo: "1", courseEntryKey: "EG-MECH-A" }]],
        ],
      },
    ],
  });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.errors[0].code, "MAPPING_VIOLATION");
  console.log("✓ seating must honor mapped venues; unmapped courses free");
}

function testStaticWiring() {
  const allotment = read("src/pages/Allotment.jsx");
  const routes = read("backend/routes/seatingRoutes.js");
  assert(/courseVenueMappings/.test(allotment), "Allotment must track courseVenueMappings");
  assert(/Venue mapping/.test(allotment), "Scheduled Courses must show Venue mapping column");
  assert(/General allotment/.test(allotment), "Unmapped courses labeled General allotment");
  assert(/seatingMode === "manual"/.test(allotment));
  assert(/validateSeatingHonorsMappings/.test(routes), "save-plan must validate mappings");
  assert(/courseVenueMappings/.test(routes));
  // Mappings cleared when session changes
  assert(
    /setCourseVenueMappings\(\{\}\)[\s\S]*examDate, examSession, examStartTime, examEndTime/.test(
      allotment.replace(/\n/g, " ")
    ) ||
      /examDate, examSession, examStartTime, examEndTime[\s\S]*setCourseVenueMappings\(\{\}\)/.test(
        allotment
      ),
    "Mappings must reset when date/session/time changes"
  );
  console.log("✓ Allotment UI + save-plan wiring present");
}

testNormalizeAndResolve();
testCapacityFiveVenuesExample();
testSessionScopedDifferentMappings();
testSeatingHonorsMappings();
testStaticWiring();
console.log("validateCourseVenueMapping: ok");
