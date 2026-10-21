/**
 * Static + unit checks for venue soft-archive after report completion.
 * Run: node backend/scripts/validateVenueArchive.mjs
 */
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const migration = read("backend/databasemigration/043_venue_archived_at.sql");
const migrationUnique = read(
  "backend/databasemigration/044_venues_active_name_type_unique.sql"
);
const ensure = read("backend/utils/ensureBlockVenueSchema.js");
const venueModel = read("backend/models/venue.js");
const blockers = read("backend/utils/dependencyChecks.js");
const routes = read("backend/routes/venueRoutes.js");
const ui = read("src/pages/Venue.jsx");
const seatingPlan = read("backend/models/SeatingPlan.js");
const initSql = read("backend/databasemigration/init.sql");

assert(
  /ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL/.test(migration),
  "Migration 043 must add venues.archived_at"
);
assert(
  /venues_active_name_type_unique/.test(migrationUnique),
  "Migration 044 must create active-only name/type unique index"
);
assert(
  /DROP CONSTRAINT IF EXISTS venues_name_type_key/.test(migrationUnique),
  "Migration 044 must drop legacy UNIQUE(name, type)"
);
assert(
  /ensureColumn\("venues", "archived_at"/.test(ensure),
  "ensureBlockVenueSchema must ensure archived_at"
);
assert(
  /venues_active_name_type_unique/.test(ensure),
  "ensureBlockVenueSchema must ensure active-only uniqueness"
);
assert(
  /DELETE FROM venue_allotment_selections WHERE venue_id/.test(venueModel),
  "archive must clear context-scoped allotment selections"
);
assert(
  !/UNIQUE\(name, type\)/.test(initSql),
  "init.sql must not keep table-level UNIQUE(name, type) that blocks recreate"
);
assert(
  /archiveById:/.test(venueModel) && /restoreById:/.test(venueModel),
  "Venue model must expose archiveById and restoreById"
);
assert(
  /deleteById: async \(id, user\) => Venue\.archiveById\(id, user\)/.test(venueModel),
  "deleteById must soft-archive rather than hard-delete"
);
assert(
  /v\.archived_at IS NULL/.test(venueModel),
  "getAll must default to excluding archived venues"
);
assert(
  /AND archived_at IS NULL/.test(venueModel) &&
    /findByNameAndType[\s\S]*archived_at IS NULL/.test(venueModel),
  "name/type lookups must ignore archived venues so SC314 can be re-created"
);
assert(
  /VENUE_NAME_IN_USE/.test(venueModel),
  "restore must refuse when an active venue already reuses the name"
);
assert(
  /status: "ARCHIVED"/.test(venueModel),
  "checkAllotmentSlot must reject archived venues"
);
assert(
  /venueArchiveBlockers/.test(blockers),
  "dependencyChecks must define venueArchiveBlockers"
);
assert(
  /UPPER\(COALESCE\(sp\.report_status, 'ACTIVE'\)\) <> 'COMPLETED'/.test(blockers),
  "Archive gate must use seating_plans.report_status COMPLETED"
);
assert(
  /ARCHIVE_VENUE/.test(routes) && /RESTORE_VENUE/.test(routes),
  "Routes must audit archive and restore"
);
assert(
  /Venue\.archiveById/.test(routes) && /Venue\.restoreById/.test(routes),
  "DELETE must call archiveById; restore route must call restoreById"
);
assert(
  /\/:uuid\/restore/.test(routes),
  "POST /venues/:uuid/restore must exist"
);
assert(
  /Archive this venue\? It will be removed from active venue management/.test(ui),
  "UI confirm must describe archival vs hard delete"
);
assert(
  /archived: "true"|archived: 'true'|params: archived \? \{ archived: "true" \}/.test(ui),
  "UI must request archived venues via query param"
);
assert(
  /api\.post\(`\/venues\/\$\{id\}\/restore`\)/.test(ui),
  "UI must restore via POST /venues/:id/restore"
);
assert(
  /LEFT JOIN venues v ON spv\.venue_id = v\.id/.test(seatingPlan),
  "Historical seating plans must LEFT JOIN venues (archived rows remain resolvable)"
);
assert(
  !/archived_at IS NULL/.test(seatingPlan),
  "SeatingPlan history queries must not filter out archived venues"
);

/** Pure logic mirror of archive eligibility used by venueArchiveBlockers. */
function canArchiveFromReportStatuses(statuses) {
  const open = (statuses || []).filter(
    (s) => String(s || "ACTIVE").toUpperCase() !== "COMPLETED"
  );
  return { allowed: open.length === 0, openCount: open.length };
}

function testNoHistoryAllowsArchive() {
  const r = canArchiveFromReportStatuses([]);
  assert.strictEqual(r.allowed, true);
  console.log("✓ venue with no exam history may be archived");
}

function testAllCompletedAllowsArchive() {
  const r = canArchiveFromReportStatuses(["COMPLETED", "COMPLETED"]);
  assert.strictEqual(r.allowed, true);
  console.log("✓ venue with all reports COMPLETED may be archived");
}

function testPendingBlocksArchive() {
  const r = canArchiveFromReportStatuses(["ACTIVE", "COMPLETED"]);
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.openCount, 1);
  console.log("✓ venue with pending ACTIVE report cannot be archived");
}

function testDefaultStatusBlocksArchive() {
  const r = canArchiveFromReportStatuses([null, undefined, ""]);
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.openCount, 3);
  console.log("✓ missing report_status defaults to ACTIVE and blocks archival");
}

function testToVenueRowMarksArchived() {
  const Venue = require("../models/venue.js");
  const row = Venue.toVenueRow(
    {
      public_uuid: "00000000-0000-4000-8000-000000000001",
      name: "SC314",
      type: "classroom",
      capacity: 40,
      benches_row: 5,
      benches_col: 4,
      is_available: true,
      use_for_allotment: true,
      archived_at: "2026-10-01T00:00:00.000Z",
    },
    { canManage: true }
  );
  assert.strictEqual(row.isArchived, true);
  assert.strictEqual(row.useForAllotment, false);
  assert.strictEqual(row.isAvailable, false);
  console.log("✓ toVenueRow exposes isArchived and disables allotment flags");
}

/**
 * Simulate active-only uniqueness after delete+recreate.
 * Archived historical id stays distinct from the new active id.
 */
function canCreateActiveVenue(existingRows, name, type) {
  const key = `${String(name).trim().toUpperCase()}::${String(type).trim().toLowerCase()}`;
  return !existingRows.some((r) => {
    if (r.archived_at) return false;
    const k = `${String(r.name).trim().toUpperCase()}::${String(r.type).trim().toLowerCase()}`;
    return k === key;
  });
}

function testDeleteThenRecreateSameCodeNewId() {
  const history = [];
  // 1. Create SC314
  history.push({
    id: 101,
    name: "SC314",
    type: "classroom",
    archived_at: null,
    venue_name_snapshot: "SC314",
  });
  assert.strictEqual(canCreateActiveVenue(history, "SC314", "classroom"), false);

  // 2. Soft-delete / archive SC314 (reports completed)
  history[0].archived_at = "2026-10-22T00:00:00.000Z";
  assert.strictEqual(
    canCreateActiveVenue(history, "SC314", "classroom"),
    true,
    "archived SC314 must free the active name slot"
  );

  // 3. Re-create SC314 as a new active row with a new id
  history.push({
    id: 202,
    name: "SC314",
    type: "classroom",
    archived_at: null,
    venue_name_snapshot: null,
  });
  assert.notStrictEqual(history[0].id, history[1].id);
  assert.strictEqual(canCreateActiveVenue(history, "SC314", "classroom"), false);

  // 4. Historical report still resolves original identity / snapshot
  const historicalDisplay =
    history[0].venue_name_snapshot || history.find((r) => r.id === 101)?.name;
  assert.strictEqual(historicalDisplay, "SC314");
  assert.strictEqual(history[0].id, 101);
  assert.ok(history[0].archived_at);

  // 5. Two active duplicates still blocked
  assert.strictEqual(canCreateActiveVenue(history, "SC314", "classroom"), false);
  assert.strictEqual(canCreateActiveVenue(history, "SC315", "classroom"), true);

  console.log(
    "✓ delete+recreate SC314: new id allowed; history keeps old id; active dup blocked"
  );
}

function testRestoreBlockedWhenNameReused() {
  const active = { id: 202, name: "SC314", type: "classroom", archived_at: null };
  const archived = {
    id: 101,
    name: "SC314",
    type: "classroom",
    archived_at: "2026-10-22T00:00:00.000Z",
  };
  const canRestore =
    canCreateActiveVenue([active, archived], archived.name, archived.type) === false
      ? false
      : true;
  // exists active → restore must be blocked
  assert.strictEqual(canRestore, false);
  console.log("✓ restore blocked when a newer active SC314 already exists");
}

testNoHistoryAllowsArchive();
testAllCompletedAllowsArchive();
testPendingBlocksArchive();
testDefaultStatusBlocksArchive();
testToVenueRowMarksArchived();
testDeleteThenRecreateSameCodeNewId();
testRestoreBlockedWhenNameReused();

console.log("validateVenueArchive: ok");
