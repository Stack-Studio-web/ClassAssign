/**
 * Offline checks for custom hall seating course order + pairing.
 */
import assert from "assert";
import {
  legacyCourseEntryKey,
  syncCourseSeatingConfig,
  validateCourseSeatingConfig,
  moveCourseInOrder,
  setCoursePair,
  getPairPartner,
  resolveSeatingCourseOrder,
  normalizePairs,
  emptyCourseSeatingConfig,
} from "../../src/lib/seatingCourseOrder.js";

function course(code, dept, batchName, batchId = null) {
  return { courseCode: code, department: dept, batchName, batchId };
}

function testDistinctKeysForSameCode() {
  const a = legacyCourseEntryKey(course("24INM202", "BAD", "2024-2028"));
  const b = legacyCourseEntryKey(course("24INM202", "BIT", "2024-2028"));
  assert.notStrictEqual(a, b);
  assert.ok(a.includes("BAD"));
  assert.ok(b.includes("BIT"));
  console.log("✓ same course code across departments gets distinct keys");
}

function testSyncAddsAndRemoves() {
  const courses = [
    course("A", "CSE", "2025-2029"),
    course("B", "CSE", "2025-2029"),
    course("C", "IT", "2024-2028"),
  ];
  let cfg = syncCourseSeatingConfig(courses, null);
  assert.strictEqual(cfg.order.length, 3);
  assert.strictEqual(cfg.useCustomOrder, false);

  cfg = {
    ...cfg,
    useCustomOrder: true,
    order: [cfg.order[2], cfg.order[0], cfg.order[1]],
    pairs: [[cfg.order[2], cfg.order[0]]],
  };

  // Remove C, add D
  const nextCourses = [
    course("A", "CSE", "2025-2029"),
    course("B", "CSE", "2025-2029"),
    course("D", "AIDS", "2025-2029"),
  ];
  const synced = syncCourseSeatingConfig(nextCourses, cfg);
  assert.ok(!synced.order.some((k) => k.includes("IT")));
  assert.ok(synced.order.some((k) => k.startsWith("D-")));
  assert.strictEqual(synced.pairs.length, 0); // pair involving removed C cleared
  assert.strictEqual(synced.useCustomOrder, true);
  console.log("✓ sync keeps custom order, drops removed courses/pairs, appends new");
}

function testMoveAndPair() {
  const courses = [
    course("A", "CSE", "1"),
    course("B", "CSE", "1"),
    course("C", "CSE", "1"),
    course("D", "CSE", "1"),
  ];
  let cfg = syncCourseSeatingConfig(courses, null);
  const [a, b, c, d] = cfg.order;

  cfg = moveCourseInOrder(cfg, d, "up");
  assert.strictEqual(cfg.useCustomOrder, true);
  assert.deepStrictEqual(cfg.order, [a, b, d, c]);

  cfg = setCoursePair(cfg, a, b);
  assert.deepStrictEqual(getPairPartner(cfg, a), b);
  assert.deepStrictEqual(getPairPartner(cfg, b), a);
  assert.strictEqual(cfg.order.indexOf(b), cfg.order.indexOf(a) + 1);

  // Pairing c with b should clear a-b and form c-b
  cfg = setCoursePair(cfg, c, b);
  assert.strictEqual(getPairPartner(cfg, a), null);
  assert.strictEqual(getPairPartner(cfg, c), b);

  // Clear pair
  cfg = setCoursePair(cfg, c, null);
  assert.strictEqual(getPairPartner(cfg, c), null);
  console.log("✓ move up/down and pair/unpair update order without multi-pair conflicts");
}

function testNormalizePairsNoDoubleBook() {
  const keys = ["A", "B", "C", "D"];
  const pairs = normalizePairs(
    [
      ["A", "B"],
      ["A", "C"], // conflict — ignored
      ["C", "D"],
      ["D", "C"], // duplicate — ignored
    ],
    keys
  );
  assert.deepStrictEqual(pairs, [
    ["A", "B"],
    ["C", "D"],
  ]);
  console.log("✓ normalizePairs prevents a course in multiple pairs");
}

function testValidateCustomOrder() {
  const keys = ["A-CSE-1", "B-CSE-1", "C-CSE-1"];
  const bad = validateCourseSeatingConfig(
    {
      useCustomOrder: true,
      order: ["A-CSE-1", "B-CSE-1"],
      pairs: [["A-CSE-1", "B-CSE-1"], ["B-CSE-1", "C-CSE-1"]],
    },
    keys
  );
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.errors.some((e) => /missing from custom order/i.test(e)));
  assert.ok(bad.errors.some((e) => /more than one pair/i.test(e)));

  const good = validateCourseSeatingConfig(
    {
      useCustomOrder: true,
      order: keys,
      pairs: [["A-CSE-1", "B-CSE-1"]],
    },
    keys
  );
  assert.strictEqual(good.ok, true);
  console.log("✓ validateCourseSeatingConfig catches incomplete order and multi-pair");
}

function testResolveDefaultVsCustom() {
  const entries = [
    { key: "small", students: [1, 2] },
    { key: "large", students: [1, 2, 3, 4, 5] },
    { key: "mid", students: [1, 2, 3] },
  ];

  const def = resolveSeatingCourseOrder(entries, emptyCourseSeatingConfig());
  assert.deepStrictEqual(
    def.map((e) => e.key),
    ["large", "mid", "small"]
  );

  const custom = resolveSeatingCourseOrder(entries, {
    useCustomOrder: true,
    order: ["small", "large", "mid"],
    pairs: [["small", "large"]],
  });
  assert.deepStrictEqual(
    custom.map((e) => e.key),
    ["small", "large", "mid"]
  );

  // Odd unpaired: three courses, one pair + one unpaired still respects order
  const odd = resolveSeatingCourseOrder(entries, {
    useCustomOrder: true,
    order: ["mid", "small", "large"],
    pairs: [["mid", "small"]],
  });
  assert.deepStrictEqual(
    odd.map((e) => e.key),
    ["mid", "small", "large"]
  );
  console.log("✓ resolveSeatingCourseOrder: default size-sort vs custom order + odd unpaired");
}

function testPersistenceRoundTripShape() {
  const courses = [
    course("24INM202", "BAD", "2024-2028"),
    course("24INM202", "BIT", "2024-2028"),
    course("24ADI016", "BAD", "2025-2029"),
  ];
  let cfg = syncCourseSeatingConfig(courses, null);
  const [bad, bit, adi] = cfg.order;
  cfg = setCoursePair(cfg, bad, bit);
  cfg = moveCourseInOrder(cfg, adi, "up");

  const json = JSON.parse(JSON.stringify(cfg));
  const restored = syncCourseSeatingConfig(courses, json);
  assert.strictEqual(restored.useCustomOrder, true);
  assert.deepStrictEqual(restored.order, json.order);
  assert.deepStrictEqual(restored.pairs, json.pairs);
  assert.notStrictEqual(bad, bit);
  console.log("✓ config JSON round-trip preserves BAD/BIT distinction and pairs");
}

testDistinctKeysForSameCode();
testSyncAddsAndRemoves();
testMoveAndPair();
testNormalizePairsNoDoubleBook();
testValidateCustomOrder();
testResolveDefaultVsCustom();
testPersistenceRoundTripShape();
console.log("\nAll seating course order checks passed.");
