/**
 * Max-count faculty allotment checks (offline).
 * Run from repo root:
 *   node backend/scripts/validateMaxCountFacultyAllotment.mjs
 */
import assert from "assert";
import {
  runAutoFacultyAllocation,
  runAutoFacultyAllocationAcrossSessions,
  snapshotFacultyCapacity,
  validateAutoFacultyPlan,
  createAllocationRuntime,
  pickBestEligibleFaculty,
  recordAutoFacultyAssignment,
} from "../../src/lib/autoFacultyAllocation.js";

function room(uuid, name) {
  return {
    venue: { uuid, name },
    seats: [[{ regnNo: "1" }]],
  };
}

function faculty(uuid, name, max, remaining, allocation = max - remaining) {
  return {
    uuid,
    name,
    department: "AD",
    maxClassrooms: max,
    remaining,
    allocation,
    isAvailable: true,
    hasTimeConflict: false,
  };
}

function testTwoDayExample() {
  const pool = [
    faculty("mani", "Mani", 3, 3),
    faculty("faizal", "Faizal", 2, 2),
    faculty("prithivi", "Prithivi", 1, 1),
  ];

  const result = runAutoFacultyAllocationAcrossSessions(
    [
      {
        examContext: {
          examDate: "2026-10-22",
          examStartTime: "08:30",
          examEndTime: "10:30",
          examSession: "FN",
        },
        venueItems: [room("d1r1", "Room 1"), room("d1r2", "Room 2")],
      },
      {
        examContext: {
          examDate: "2026-10-23",
          examStartTime: "08:30",
          examEndTime: "10:30",
          examSession: "FN",
        },
        venueItems: [room("d2r1", "Room 1"), room("d2r2", "Room 2")],
      },
    ],
    pool
  );

  const day1 = result.sessions[0].items;
  const day2 = result.sessions[1].items;

  // Day 1: highest remaining first → Mani (3), then Faizal (2)
  assert.strictEqual(day1[0].facultyId, "mani", "Day1 Room1 → Mani");
  assert.strictEqual(day1[1].facultyId, "faizal", "Day1 Room2 → Faizal");

  const afterDay1 = Object.fromEntries(
    result.sessions[0].capacitySnapshot.map((r) => [r.uuid, r.remaining])
  );
  assert.strictEqual(afterDay1.mani, 2);
  assert.strictEqual(afterDay1.faizal, 1);
  assert.strictEqual(afterDay1.prithivi, 1);

  // Day 2: Mani still highest remaining (2); then Faizal before Prithivi (name tie at 1)
  assert.strictEqual(day2[0].facultyId, "mani", "Day2 Room1 → Mani");
  assert.strictEqual(day2[1].facultyId, "faizal", "Day2 Room2 → Faizal (tie-break by name)");

  const final = Object.fromEntries(
    result.capacitySnapshot.map((r) => [r.uuid, r.remaining])
  );
  assert.strictEqual(final.mani, 1);
  assert.strictEqual(final.faizal, 0);
  assert.strictEqual(final.prithivi, 1);
  assert.strictEqual(result.unassigned.length, 0);

  console.log("✓ two-day max-count allotment (Mani 3 / Faizal 2 / Prithivi 1)");
}

function testRemainingDecreasesAndZeroExcluded() {
  const pool = [
    faculty("a", "Alpha", 1, 1),
    faculty("b", "Beta", 1, 0),
  ];
  const items = runAutoFacultyAllocation(
    [room("r1", "R1"), room("r2", "R2")],
    pool,
    { examDate: "2026-11-01", examStartTime: "09:00", examEndTime: "12:00" }
  );
  assert.strictEqual(items[0].facultyId, "a");
  assert.ok(items[1].needsFaculty, "second room unfilled when capacity exhausted");
  assert.ok(
    items[1].unfilledReason && /remaining count is zero|capacity exhausted/i.test(items[1].unfilledReason)
  );
  console.log("✓ remaining decreases; zero remaining excluded; unfilled reason set");
}

function testExistingAssignmentsInCount() {
  // Mani already has 1 saved assignment → remaining 2 of max 3
  // Faizal remaining 1 so Mani is preferred by highest-remaining rule
  const pool = [
    faculty("mani", "Mani", 3, 2, 1),
    faculty("faizal", "Faizal", 2, 1, 1),
  ];
  const runtime = createAllocationRuntime(pool);
  const snap = snapshotFacultyCapacity(pool, runtime);
  const mani = snap.find((r) => r.uuid === "mani");
  assert.strictEqual(mani.allocation, 1);
  assert.strictEqual(mani.remaining, 2);

  const item = assignOne(runtime, pool, "mani", {
    examDate: "2026-11-02",
    examStartTime: "09:00",
    examEndTime: "11:00",
  });
  assert.strictEqual(item.facultyId, "mani");
  assert.strictEqual(runtime.remainingSlots.get("mani"), 1);
  console.log("✓ existing assignments included in remaining count");
}

function assignOne(runtime, pool, expectedId, examContext) {
  const item = room("vx", "VX");
  const faculty = pickBestEligibleFaculty(runtime, examContext);
  assert.strictEqual(faculty?.uuid, expectedId);
  recordAutoFacultyAssignment(runtime, faculty, item, examContext);
  return { ...item, facultyId: faculty.uuid };
}

function testSameDayConflictSkipsDespiteRemaining() {
  const pool = [
    {
      ...faculty("mani", "Mani", 3, 3),
      hasTimeConflict: true,
      conflictInfo: {
        examDate: "2026-11-03",
        venueName: "AD208",
        examStartTime: "08:30",
        examEndTime: "10:30",
      },
    },
    faculty("faizal", "Faizal", 2, 2),
  ];
  const items = runAutoFacultyAllocation(
    [room("r1", "R1")],
    pool,
    { examDate: "2026-11-03", examStartTime: "11:00", examEndTime: "13:00" }
  );
  assert.strictEqual(items[0].facultyId, "faizal", "skip same-day busy Mani despite higher remaining");
  console.log("✓ same-day conflict skips faculty with remaining capacity");
}

function testMultiSessionSameDayBlockedInSharedRuntime() {
  const pool = [faculty("mani", "Mani", 3, 3), faculty("faizal", "Faizal", 2, 2)];
  const result = runAutoFacultyAllocationAcrossSessions(
    [
      {
        examContext: {
          examDate: "2026-11-04",
          examStartTime: "08:30",
          examEndTime: "10:30",
          examSession: "FN",
        },
        venueItems: [room("a", "A")],
      },
      {
        examContext: {
          examDate: "2026-11-04",
          examStartTime: "11:00",
          examEndTime: "13:00",
          examSession: "AN",
        },
        venueItems: [room("b", "B")],
      },
    ],
    pool
  );
  assert.strictEqual(result.sessions[0].items[0].facultyId, "mani");
  // Same calendar day → Mani busy; Faizal chosen for second session
  assert.strictEqual(result.sessions[1].items[0].facultyId, "faizal");
  console.log("✓ overlapping / same-day sessions blocked in multi-session planner");
}

function testManualCapacityValidationShape() {
  const pool = [faculty("p", "Prithivi", 1, 0)];
  const validation = validateAutoFacultyPlan(
    [{ ...room("r1", "R1"), facultyId: "p" }],
    pool,
    { examDate: "2026-11-05", examStartTime: "09:00", examEndTime: "12:00" }
  );
  assert.strictEqual(validation.canSubmit, false);
  assert.ok(validation.conflicts.some((c) => c.type === "capacity"));
  console.log("✓ assignment over remaining capacity rejected by validator");
}

function testNoDoubleCountOnRerunSimulation() {
  // Pool already reflects one saved Mani assignment (remaining 2).
  // Auto run for one room should leave remaining 1 — not treat max as fresh 3.
  const pool = [faculty("mani", "Mani", 3, 2, 1)];
  const day = runAutoFacultyAllocation(
    [room("r1", "R1")],
    pool,
    { examDate: "2026-11-06", examStartTime: "09:00", examEndTime: "12:00" }
  );
  assert.strictEqual(day[0].facultyId, "mani");
  const runtime = createAllocationRuntime(pool);
  recordAutoFacultyAssignment(runtime, pool[0], room("r1", "R1"), {
    examDate: "2026-11-06",
    examStartTime: "09:00",
    examEndTime: "12:00",
  });
  assert.strictEqual(runtime.remainingSlots.get("mani"), 1);
  const snap = snapshotFacultyCapacity(pool, runtime);
  assert.strictEqual(snap[0].allocation, 2); // 1 saved + 1 in this run
  assert.strictEqual(snap[0].remaining, 1);
  console.log("✓ rerun uses backend remaining (no double-count of max)");
}

testTwoDayExample();
testRemainingDecreasesAndZeroExcluded();
testExistingAssignmentsInCount();
testSameDayConflictSkipsDespiteRemaining();
testMultiSessionSameDayBlockedInSharedRuntime();
testManualCapacityValidationShape();
testNoDoubleCountOnRerunSimulation();
console.log("\nAll max-count faculty allotment checks passed.");
