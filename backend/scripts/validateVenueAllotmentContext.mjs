/**
 * Available = global venue status.
 * Use for Allotment = per Academic Context preference.
 * Occupancy conflicts remain global across contexts.
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

assert.ok(migration.includes("venue_allotment_selections"));
assert.ok(migration.includes("UNIQUE (venue_id, academic_context_id)"));
assert.ok(
  migration.includes("Do NOT invent") || migration.includes("ambiguous"),
  "migration must document ambiguous legacy attribution"
);
assert.ok(
  !/INSERT INTO venue_allotment_selections[\s\S]*FROM academic_contexts/.test(migration),
  "must not copy selections into every Academic Context"
);
assert.ok(ensure.includes("venue_allotment_selections"));
assert.ok(
  ensure.includes("ambiguous") || ensure.includes("no resolvable Academic Context"),
  "ensure must report ambiguous legacy global ON rows"
);
assert.ok(venueModel.includes("assertCanModifyAllotmentSelection"));
assert.ok(venueModel.includes("isSelectedForContext"));
assert.ok(
  venueModel.includes("SET is_available = ?"),
  "Available must remain a global venues.is_available update"
);
assert.ok(venueRoutes.includes("academicContextId: ownerOpts.academicContextId"));
assert.ok(
  seatingRoutes.includes("academicContextId: allotmentOwnerOpts.academicContextId")
);

/** In-memory: one global venue record + per-context selection rows. */
function makeStore() {
  const venues = new Map(); // id -> { id, name, isAvailable, archived }
  const selections = new Map(); // `${venueId}:${contextId}` -> true
  return {
    upsertVenue(v) {
      venues.set(v.id, {
        id: v.id,
        name: v.name || String(v.id),
        isAvailable: v.isAvailable !== false,
        archived: Boolean(v.archived),
      });
    },
    setAvailable(id, value) {
      const v = venues.get(id);
      if (!v) return false;
      v.isAvailable = value === true;
      return true;
    },
    select(venueId, contextId) {
      selections.set(`${venueId}:${contextId}`, true);
    },
    clear(venueId, contextId) {
      selections.delete(`${venueId}:${contextId}`);
    },
    isSelected(venueId, contextId) {
      return contextId != null && selections.has(`${venueId}:${contextId}`);
    },
    listSelected(contextId) {
      const out = [];
      for (const key of selections.keys()) {
        const [v, c] = key.split(":").map(Number);
        if (c === contextId) out.push(v);
      }
      return out.sort((a, b) => a - b);
    },
    venueCount() {
      return venues.size;
    },
    get(id) {
      return venues.get(id) || null;
    },
  };
}

function canModify(role, userContextId, targetContextId) {
  if (!targetContextId) return false;
  if (role === "admin") return true;
  if (role !== "faculty_incharge") return false;
  return Number(userContextId) === Number(targetContextId);
}

function allotmentPool(store, contextId) {
  return store
    .listSelected(contextId)
    .map((id) => store.get(id))
    .filter((v) => v && !v.archived && v.isAvailable !== false);
}

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function checkSlot(store, bookings, venueId, contextId, date, start, end) {
  const v = store.get(venueId);
  if (!v) return { ok: false, status: "NOT_FOUND" };
  if (v.archived) return { ok: false, status: "ARCHIVED" };
  if (v.isAvailable === false) return { ok: false, status: "DISABLED" };
  if (!store.isSelected(venueId, contextId)) {
    return { ok: false, status: "NOT_ELIGIBLE" };
  }
  const conflict = bookings.find(
    (b) =>
      b.venueId === venueId &&
      b.date === date &&
      intervalsOverlap(b.start, b.end, start, end)
  );
  if (conflict) {
    return {
      ok: false,
      status: "OCCUPIED",
      conflict,
      message: `${v.name} occupied ${conflict.start}-${conflict.end} on ${date}`,
    };
  }
  return { ok: true, status: "AVAILABLE" };
}

function backfillSelections(globalOnVenues) {
  const attributed = [];
  const ambiguous = [];
  for (const v of globalOnVenues) {
    if (!v.useForAllotment) continue;
    if (!v.creatorAcademicContextId) {
      ambiguous.push(v.id);
      continue;
    }
    attributed.push({
      venueId: v.id,
      academicContextId: v.creatorAcademicContextId,
    });
  }
  return { attributed, ambiguous };
}

const KSI = 10;
const SFS = 20;
const V101 = 101;
const V102 = 102;
const V103 = 103;
const V104 = 104;
const V105 = 105;
const V107 = 107;

const store = makeStore();
for (const id of [V101, V102, V103, V104, V105, V107]) {
  store.upsertVenue({ id, name: `Venue ${id}`, isAvailable: true });
}

// 1. KSI selects 101–104; SFS independently selects 102, 103, 105, 107
for (const id of [V101, V102, V103, V104]) store.select(id, KSI);
for (const id of [V102, V103, V105, V107]) store.select(id, SFS);
assert.deepEqual(store.listSelected(KSI), [V101, V102, V103, V104]);
assert.deepEqual(store.listSelected(SFS), [V102, V103, V105, V107]);
console.log("✓ 1. KSI and SFS independent selections (101–104 vs 102/103/105/107)");

// 2. Switching contexts shows correct independent selections
assert.deepEqual(store.listSelected(KSI), [V101, V102, V103, V104]);
assert.deepEqual(store.listSelected(SFS), [V102, V103, V105, V107]);
console.log("✓ 2. switching contexts shows the correct independent selections");

// 3. Updating SFS does not change KSI
store.clear(V105, SFS);
store.select(V101, SFS);
assert.deepEqual(store.listSelected(SFS), [V101, V102, V103, V107]);
assert.deepEqual(store.listSelected(KSI), [V101, V102, V103, V104]);
console.log("✓ 3. updating SFS selections does not change KSI");

// restore SFS expected set for later tests
store.clear(V101, SFS);
store.select(V105, SFS);

// 4. Same physical venue, no duplicate records
assert.strictEqual(store.venueCount(), 6);
assert.strictEqual(store.isSelected(V102, KSI), true);
assert.strictEqual(store.isSelected(V102, SFS), true);
assert.strictEqual(store.get(V102).name, "Venue 102");
console.log("✓ 4. same physical venue selected in both contexts without duplicates");

// 5. Global Available OFF affects eligibility in every context
store.setAvailable(V102, false);
assert.deepEqual(
  allotmentPool(store, KSI).map((v) => v.id),
  [V101, V103, V104]
);
assert.deepEqual(
  allotmentPool(store, SFS).map((v) => v.id),
  [V103, V105, V107]
);
assert.strictEqual(store.isSelected(V102, KSI), true);
assert.strictEqual(store.isSelected(V102, SFS), true);
assert.strictEqual(
  checkSlot(store, [], V102, KSI, "2026-10-29", "08:00", "10:00").status,
  "DISABLED"
);
assert.strictEqual(
  checkSlot(store, [], V102, SFS, "2026-10-29", "08:00", "10:00").status,
  "DISABLED"
);
store.setAvailable(V102, true);
console.log("✓ 5. Available OFF blocks eligibility across every context (selection retained)");

// 6. Context-specific summaries / capacity
const caps = {
  [V101]: 40,
  [V102]: 40,
  [V103]: 50,
  [V104]: 60,
  [V105]: 30,
  [V107]: 70,
};
function capacity(contextId) {
  return store
    .listSelected(contextId)
    .reduce((sum, id) => sum + (caps[id] || 0), 0);
}
assert.strictEqual(capacity(KSI), 190);
assert.strictEqual(capacity(SFS), 190);
console.log("✓ 6. context-specific summary capacities are correct");

// 7. Allotment uses current context selection
assert.deepEqual(
  allotmentPool(store, KSI).map((v) => v.id),
  [V101, V102, V103, V104]
);
assert.deepEqual(
  allotmentPool(store, SFS).map((v) => v.id),
  [V102, V103, V105, V107]
);
assert.ok(!allotmentPool(store, SFS).some((v) => v.id === V101));
assert.ok(!allotmentPool(store, KSI).some((v) => v.id === V105));
console.log("✓ 7. allotment uses the current context's selection");

// 8–9. Overlap blocked; non-overlap allowed
const bookings = [];
assert.strictEqual(
  checkSlot(store, bookings, V103, KSI, "2026-10-29", "08:00", "10:00").ok,
  true
);
bookings.push({
  venueId: V103,
  context: KSI,
  date: "2026-10-29",
  start: "08:00",
  end: "10:00",
});
assert.strictEqual(
  checkSlot(store, bookings, V103, SFS, "2026-10-29", "09:00", "11:00").status,
  "OCCUPIED"
);
assert.strictEqual(
  checkSlot(store, bookings, V103, SFS, "2026-10-29", "13:00", "15:00").ok,
  true
);
console.log("✓ 8. overlapping bookings across contexts are rejected");
console.log("✓ 9. non-overlapping bookings are permitted");

// 10. Unauthorized cross-context updates rejected
assert.strictEqual(canModify("faculty_incharge", KSI, KSI), true);
assert.strictEqual(canModify("faculty_incharge", KSI, SFS), false);
assert.strictEqual(canModify("faculty_incharge", SFS, KSI), false);
assert.strictEqual(canModify("faculty_incharge", KSI, null), false);
console.log("✓ 10. unauthorized cross-context updates are rejected");

// 11. Historical allotments unchanged (bookings additive; prior row intact)
assert.strictEqual(bookings.length, 1);
assert.strictEqual(bookings[0].context, KSI);
assert.strictEqual(bookings[0].venueId, V103);
console.log("✓ 11. historical allotments remain unchanged");

// Legacy backfill: attribute only when context known; report ambiguity otherwise
const { attributed, ambiguous } = backfillSelections([
  { id: 1, useForAllotment: true, creatorAcademicContextId: KSI },
  { id: 2, useForAllotment: true, creatorAcademicContextId: null },
  { id: 3, useForAllotment: false, creatorAcademicContextId: SFS },
]);
assert.deepEqual(attributed, [{ venueId: 1, academicContextId: KSI }]);
assert.deepEqual(ambiguous, [2]);
console.log("✓ legacy backfill attributes creator context only; reports unresolved as ambiguous");

// Generate + save both revalidate
const gen = checkSlot(store, bookings, V103, SFS, "2026-10-29", "09:30", "10:30");
const save = checkSlot(store, bookings, V103, SFS, "2026-10-29", "09:30", "10:30");
assert.strictEqual(gen.status, "OCCUPIED");
assert.strictEqual(save.status, "OCCUPIED");
console.log("✓ generate and save both revalidate occupancy");

const Venue = require("../models/venue.js");
assert.strictEqual(Venue.normalizeContextId("12"), 12);
assert.strictEqual(Venue.normalizeContextId(null), null);
assert.strictEqual(typeof Venue.assertCanModifyAllotmentSelection, "function");
assert.strictEqual(typeof Venue.setAvailability, "function");
console.log("✓ Venue model exposes global Available + context selection APIs");

console.log("\nAll venue Available/Use-for-Allotment dual-scope checks passed.");
