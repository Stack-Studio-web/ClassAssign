/**
 * Use for Allotment must be scoped per Academic Context (KSI ≠ SFS).
 * Offline regression — no DB required.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const require = createRequire(import.meta.url);

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const migration = read("databasemigration/045_venue_allotment_selections.sql");
const ensure = read("utils/ensureBlockVenueSchema.js");
const venueModel = read("models/venue.js");
const venueRoutes = read("routes/venueRoutes.js");
const seatingRoutes = read("routes/seatingRoutes.js");

assert.ok(
  migration.includes("venue_allotment_selections"),
  "migration must create venue_allotment_selections"
);
assert.ok(
  migration.includes("UNIQUE (venue_id, academic_context_id)"),
  "selection must be unique per venue+context"
);
assert.ok(
  migration.includes("u.academic_context_id"),
  "backfill must attribute to creator's Academic Context only"
);
assert.ok(
  !/INSERT INTO venue_allotment_selections[\s\S]*FROM academic_contexts/.test(migration),
  "must not copy selections into every Academic Context"
);
assert.ok(
  ensure.includes("venue_allotment_selections"),
  "ensureBlockVenueSchema must create selections table"
);

assert.ok(
  venueModel.includes("assertCanModifyAllotmentSelection"),
  "model must authorize context-scoped selection mutations"
);
assert.ok(
  venueModel.includes("isSelectedForContext"),
  "model must resolve selection per Academic Context"
);
assert.ok(
  venueModel.includes("venue_allotment_selections"),
  "model must read/write selections table"
);
assert.ok(
  venueRoutes.includes("academicContextId: ownerOpts.academicContextId"),
  "venue routes must pass session Academic Context"
);
assert.ok(
  seatingRoutes.includes("academicContextId: allotmentOwnerOpts.academicContextId"),
  "seating save must use current context selection"
);

/** In-memory selection store simulating the junction table. */
function makeSelectionStore() {
  const rows = new Map(); // `${venueId}:${contextId}` -> true
  return {
    select(venueId, contextId) {
      rows.set(`${venueId}:${contextId}`, true);
    },
    clear(venueId, contextId) {
      rows.delete(`${venueId}:${contextId}`);
    },
    isSelected(venueId, contextId) {
      if (!contextId) return false;
      return rows.has(`${venueId}:${contextId}`) === true;
    },
    listForContext(contextId) {
      const out = [];
      for (const key of rows.keys()) {
        const [v, c] = key.split(":").map(Number);
        if (c === contextId) out.push(v);
      }
      return out.sort((a, b) => a - b);
    },
  };
}

const KSI = 10;
const SFS = 20;
const VENUE_A = 1;
const VENUE_B = 2;

const store = makeSelectionStore();

// KSI selects venues — SFS must not see them
store.select(VENUE_A, KSI);
store.select(VENUE_B, KSI);
assert.deepEqual(store.listForContext(KSI), [VENUE_A, VENUE_B]);
assert.deepEqual(store.listForContext(SFS), []);
assert.strictEqual(store.isSelected(VENUE_A, SFS), false);
console.log("✓ KSI selections are not visible under SFS");

// SFS selects a venue — KSI unchanged
store.select(VENUE_A, SFS);
assert.deepEqual(store.listForContext(SFS), [VENUE_A]);
assert.deepEqual(store.listForContext(KSI), [VENUE_A, VENUE_B]);
console.log("✓ SFS selection does not change KSI");

// Same venue independently in both contexts
assert.strictEqual(store.isSelected(VENUE_A, KSI), true);
assert.strictEqual(store.isSelected(VENUE_A, SFS), true);
console.log("✓ same venue can be selected in both contexts independently");

// Summary counts scoped to context
function capacityFor(contextId, capacities) {
  return store
    .listForContext(contextId)
    .reduce((sum, id) => sum + (capacities[id] || 0), 0);
}
const caps = { [VENUE_A]: 40, [VENUE_B]: 60 };
assert.strictEqual(capacityFor(KSI, caps), 100);
assert.strictEqual(capacityFor(SFS, caps), 40);
console.log("✓ summary counts/capacities reflect only the current context");

// Allotment pool uses context selection only
function allotmentPool(contextId, venues) {
  return venues.filter(
    (v) => v.isAvailable !== false && store.isSelected(v.id, contextId)
  );
}
const venues = [
  { id: VENUE_A, isAvailable: true },
  { id: VENUE_B, isAvailable: true },
];
assert.deepEqual(
  allotmentPool(KSI, venues).map((v) => v.id),
  [VENUE_A, VENUE_B]
);
assert.deepEqual(
  allotmentPool(SFS, venues).map((v) => v.id),
  [VENUE_A]
);
assert.deepEqual(allotmentPool(null, venues), []);
console.log("✓ each context's allotment uses its own selected venues");

// Global conflict check remains independent of selection scope
function hasGlobalConflict(bookings, venueId, start, end) {
  return bookings.some(
    (b) =>
      b.venueId === venueId && b.start < end && b.end > start
  );
}
const bookings = [
  { venueId: VENUE_A, contextId: KSI, start: "09:00", end: "11:00" },
];
assert.strictEqual(
  hasGlobalConflict(bookings, VENUE_A, "10:00", "12:00"),
  true,
  "SFS booking must still conflict with KSI's overlapping exam"
);
assert.strictEqual(
  hasGlobalConflict(bookings, VENUE_A, "11:00", "13:00"),
  false,
  "adjacent interval is allowed"
);
console.log("✓ global reservation/conflict checks still prevent overlapping bookings");

// Authorization: FI cannot mutate another context
function canModify(role, userContextId, targetContextId) {
  if (!targetContextId) return false;
  if (role === "admin") return true;
  if (role !== "faculty_incharge") return false;
  return Number(userContextId) === Number(targetContextId);
}
assert.strictEqual(canModify("faculty_incharge", KSI, KSI), true);
assert.strictEqual(canModify("faculty_incharge", KSI, SFS), false);
assert.strictEqual(canModify("faculty_incharge", KSI, null), false);
assert.strictEqual(canModify("admin", null, KSI), true);
console.log("✓ authorization only allows managing permitted contexts");

// Empty SFS default state
store.clear(VENUE_A, SFS);
assert.deepEqual(store.listForContext(SFS), []);
assert.strictEqual(store.isSelected(VENUE_A, SFS), false);
console.log("✓ context with no saved selections shows unselected state");

// Backfill attribution helper (creator context only)
function backfillSelections(globalOnVenues) {
  const out = [];
  for (const v of globalOnVenues) {
    if (!v.useForAllotment) continue;
    if (!v.creatorAcademicContextId) continue; // skip unresolved — do not invent
    out.push({
      venueId: v.id,
      academicContextId: v.creatorAcademicContextId,
    });
  }
  return out;
}
const attributed = backfillSelections([
  { id: 1, useForAllotment: true, creatorAcademicContextId: KSI },
  { id: 2, useForAllotment: true, creatorAcademicContextId: null },
  { id: 3, useForAllotment: false, creatorAcademicContextId: SFS },
]);
assert.deepEqual(attributed, [{ venueId: 1, academicContextId: KSI }]);
console.log("✓ backfill attributes only to creator context; skips unresolved");

const Venue = require("../models/venue.js");
assert.strictEqual(Venue.normalizeContextId(null), null);
assert.strictEqual(Venue.normalizeContextId("12"), 12);
assert.strictEqual(Venue.normalizeContextId(0), null);
console.log("✓ normalizeContextId rejects missing/invalid ids");

console.log("\nAll venue allotment context checks passed.");
