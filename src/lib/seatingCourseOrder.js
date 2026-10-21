/**
 * Custom course order + pairing for hall seating generation.
 * Keys distinguish same course code across department/batch entries.
 */

/** Stable unique key for a scheduled course entry (not course code alone). */
export function courseEntryKey(course) {
  if (!course || typeof course !== "object") return "";
  const code = String(course.courseCode ?? course.coursecode ?? "").trim();
  const dept = String(course.department ?? "").trim();
  const batchId = course.batchId ?? course.batchid ?? course.batch_id;
  const batchName = String(course.batchName ?? course.batchname ?? course.batch ?? "")
    .trim()
    .toUpperCase();
  if (batchId != null && batchId !== "" && Number.isFinite(Number(batchId))) {
    return `${code}|${dept}|id:${Number(batchId)}`;
  }
  return `${code}|${dept}|${batchName}`;
}

/** Legacy Allotment.jsx key — kept for studentsByCourse map compatibility. */
export function legacyCourseEntryKey(course) {
  const code = String(course?.courseCode ?? course?.coursecode ?? "").trim();
  const dept = String(course?.department ?? "").trim();
  const batchName = String(course?.batchName ?? course?.batchname ?? course?.batch ?? "")
    .trim()
    .toUpperCase();
  return `${code}-${dept}-${batchName}`;
}

/**
 * Prefer stable key; also return legacy key so callers can index either map.
 * Generation uses legacy keys to match existing studentsByCourse.
 */
export function courseKeysForEntry(course) {
  return {
    key: courseEntryKey(course),
    legacyKey: legacyCourseEntryKey(course),
  };
}

export function emptyCourseSeatingConfig() {
  return {
    version: 1,
    useCustomOrder: false,
    order: [],
    pairs: [],
  };
}

function pairSignature(a, b) {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

/**
 * Normalize pairs: unique undirected pairs, no self-pairs, no course in >1 pair.
 * First occurrence wins when conflicts exist.
 */
export function normalizePairs(pairs, allowedKeys) {
  const allow = new Set(allowedKeys || []);
  const used = new Set();
  const out = [];
  const seen = new Set();

  for (const raw of pairs || []) {
    if (!Array.isArray(raw) || raw.length < 2) continue;
    const a = String(raw[0] || "");
    const b = String(raw[1] || "");
    if (!a || !b || a === b) continue;
    if (allow.size && (!allow.has(a) || !allow.has(b))) continue;
    if (used.has(a) || used.has(b)) continue;
    const sig = pairSignature(a, b);
    if (seen.has(sig)) continue;
    seen.add(sig);
    used.add(a);
    used.add(b);
    out.push([a, b]);
  }
  return out;
}

/**
 * Keep order covering all current course keys; drop removed; append new at end.
 * Pairs cleaned to valid keys only.
 */
export function syncCourseSeatingConfig(courses, prevConfig = null) {
  const prev = prevConfig && typeof prevConfig === "object" ? prevConfig : emptyCourseSeatingConfig();
  const entries = (courses || []).map((c) => ({
    course: c,
    key: legacyCourseEntryKey(c),
  })).filter((e) => e.key && e.key !== "--");

  const keys = entries.map((e) => e.key);
  const keySet = new Set(keys);

  let order = Array.isArray(prev.order)
    ? prev.order.map(String).filter((k) => keySet.has(k))
    : [];
  for (const k of keys) {
    if (!order.includes(k)) order.push(k);
  }

  const pairs = normalizePairs(prev.pairs, keys);

  return {
    version: 1,
    useCustomOrder: Boolean(prev.useCustomOrder),
    order,
    pairs,
  };
}

/**
 * Validate config against the set of scheduled (or eligible) course keys.
 * @returns {{ ok: boolean, errors: string[], config: object }}
 */
export function validateCourseSeatingConfig(config, scheduledKeys) {
  const errors = [];
  const keys = [...new Set((scheduledKeys || []).map(String).filter(Boolean))];
  const keySet = new Set(keys);

  if (!config || typeof config !== "object") {
    return { ok: true, errors: [], config: emptyCourseSeatingConfig() };
  }

  const orderFromConfig = Array.isArray(config.order) ? config.order.map(String) : [];
  const useCustomOrder = Boolean(config.useCustomOrder);

  // Validate against the caller-provided order/pairs (not auto-healed copies).
  if (useCustomOrder) {
    if (!orderFromConfig.length) {
      errors.push("Custom order is enabled but no course order was provided.");
    } else {
      const orderSet = new Set(orderFromConfig);
      if (orderSet.size !== orderFromConfig.length) {
        errors.push("Course order contains duplicate entries.");
      }
      for (const k of orderFromConfig) {
        if (!keySet.has(k)) {
          errors.push(`Order references unknown course entry: ${k}`);
        }
      }
      for (const k of keys) {
        if (!orderSet.has(k)) {
          errors.push(`Scheduled course missing from custom order: ${k}`);
        }
      }
    }

    const used = new Set();
    for (const raw of config.pairs || []) {
      if (!Array.isArray(raw) || raw.length < 2) {
        errors.push("Each pair must list exactly two course entries.");
        continue;
      }
      const a = String(raw[0] || "");
      const b = String(raw[1] || "");
      if (!a || !b || a === b) {
        errors.push("Invalid pair: two distinct course entries are required.");
        continue;
      }
      if (!keySet.has(a) || !keySet.has(b)) {
        errors.push(`Pair references unknown course entry (${a}, ${b}).`);
        continue;
      }
      if (used.has(a) || used.has(b)) {
        errors.push(`Course entry appears in more than one pair: ${used.has(a) ? a : b}`);
        continue;
      }
      used.add(a);
      used.add(b);
    }
  }

  const safe = {
    version: 1,
    useCustomOrder,
    order: keys.length
      ? [
          ...orderFromConfig.filter((k) => keySet.has(k)),
          ...keys.filter((k) => !orderFromConfig.includes(k)),
        ]
      : [],
    pairs: normalizePairs(config.pairs, keys),
  };

  return { ok: errors.length === 0, errors, config: safe };
}

/**
 * Move a key up/down in the order array. Enables custom order.
 */
export function moveCourseInOrder(config, key, direction) {
  const order = [...(config?.order || [])].map(String);
  const idx = order.indexOf(String(key));
  if (idx < 0) {
    return {
      version: 1,
      useCustomOrder: true,
      order,
      pairs: normalizePairs(config?.pairs, order),
    };
  }
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= order.length) {
    return {
      version: 1,
      useCustomOrder: true,
      order,
      pairs: normalizePairs(config?.pairs, order),
    };
  }
  const next = [...order];
  [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
  return {
    version: 1,
    useCustomOrder: true,
    order: next,
    pairs: normalizePairs(config?.pairs, next),
  };
}

/**
 * Set or clear a pair partner for `key`. Partner is placed immediately after `key` in order.
 * Clears any previous pairs involving either course.
 */
export function setCoursePair(config, key, partnerKey) {
  const order = [...(config?.order || [])].map(String);
  const a = String(key || "");
  const b = partnerKey == null || partnerKey === "" ? null : String(partnerKey);

  let pairs = normalizePairs(config?.pairs, order).filter(
    ([x, y]) => x !== a && y !== a && (b == null || (x !== b && y !== b))
  );

  let nextOrder = [...order];
  if (b) {
    pairs = normalizePairs([...pairs, [a, b]], nextOrder);
    // Place partner immediately after key
    nextOrder = nextOrder.filter((k) => k !== b);
    const ai = nextOrder.indexOf(a);
    if (ai >= 0) {
      nextOrder.splice(ai + 1, 0, b);
    } else {
      nextOrder.push(a, b);
    }
  }

  return {
    version: 1,
    useCustomOrder: true,
    order: nextOrder,
    pairs,
  };
}

export function getPairPartner(config, key) {
  const k = String(key || "");
  for (const [a, b] of config?.pairs || []) {
    if (a === k) return b;
    if (b === k) return a;
  }
  return null;
}

/**
 * Resolve the course processing order for seating generation.
 * @param {Array<{ key: string, students: any[] }>} eligibleEntries
 * @param {object|null} config
 * @returns {Array<{ key: string, students: any[] }>}
 */
export function resolveSeatingCourseOrder(eligibleEntries, config) {
  const entries = Array.isArray(eligibleEntries) ? [...eligibleEntries] : [];
  if (!entries.length) return [];

  const byKey = new Map(entries.map((e) => [e.key, e]));

  // Default behaviour: largest course first
  if (!config?.useCustomOrder) {
    return entries.sort((a, b) => b.students.length - a.students.length);
  }

  const ordered = [];
  const seen = new Set();
  for (const k of config.order || []) {
    if (byKey.has(k) && !seen.has(k)) {
      ordered.push(byKey.get(k));
      seen.add(k);
    }
  }
  // Any eligible not in order (should be rare after sync) — append by size
  const rest = entries
    .filter((e) => !seen.has(e.key))
    .sort((a, b) => b.students.length - a.students.length);
  return [...ordered, ...rest];
}

/** localStorage key for allotment draft config for an exam slot. */
export function courseSeatingStorageKey(slot) {
  const date = String(slot?.examDate || "").slice(0, 10);
  const session = String(slot?.examSession || "");
  const start = String(slot?.examStartTime || "");
  const end = String(slot?.examEndTime || "");
  const type = String(slot?.examType || "");
  return `hallora:courseSeatingConfig:${date}|${session}|${start}|${end}|${type}`;
}

export function loadCourseSeatingConfigFromStorage(slot) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(courseSeatingStorageKey(slot));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCourseSeatingConfigToStorage(slot, config) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(courseSeatingStorageKey(slot), JSON.stringify(config));
  } catch {
    /* ignore quota */
  }
}

export function clearCourseSeatingConfigStorage(slot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(courseSeatingStorageKey(slot));
  } catch {
    /* ignore */
  }
}
