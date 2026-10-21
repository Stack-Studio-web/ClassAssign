/**
 * Backend validation for hall seating course order / pairing config.
 * Mirrors src/lib/seatingCourseOrder.js (keep in sync).
 */

function emptyCourseSeatingConfig() {
  return { version: 1, useCustomOrder: false, order: [], pairs: [] };
}

function pairSignature(a, b) {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

function normalizePairs(pairs, allowedKeys) {
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
 * @param {object|null} config
 * @param {string[]} scheduledKeys
 * @returns {{ ok: boolean, errors: string[], config: object }}
 */
function validateCourseSeatingConfig(config, scheduledKeys) {
  const errors = [];
  const keys = [...new Set((scheduledKeys || []).map(String).filter(Boolean))];
  const keySet = new Set(keys);

  if (!config || typeof config !== "object") {
    return { ok: true, errors: [], config: emptyCourseSeatingConfig() };
  }

  const orderFromConfig = Array.isArray(config.order) ? config.order.map(String) : [];
  const useCustomOrder = Boolean(config.useCustomOrder);

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
 * Derive scheduled keys from selectedCourses payload when it includes entry keys,
 * or from courseSeatingConfig.order / timetable-shaped objects.
 */
function extractScheduledKeysFromSavePayload(body) {
  const cfg = body?.courseSeatingConfig;
  if (Array.isArray(cfg?.order) && cfg.order.length) {
    return cfg.order.map(String);
  }
  const selected = body?.selectedCourses;
  if (Array.isArray(selected) && selected.length && typeof selected[0] === "object") {
    return selected
      .map((c) => {
        const code = String(c.courseCode ?? c.coursecode ?? "").trim();
        const dept = String(c.department ?? "").trim();
        const batchName = String(c.batchName ?? c.batchname ?? c.batch ?? "")
          .trim()
          .toUpperCase();
        return `${code}-${dept}-${batchName}`;
      })
      .filter(Boolean);
  }
  return [];
}

module.exports = {
  emptyCourseSeatingConfig,
  normalizePairs,
  validateCourseSeatingConfig,
  extractScheduledKeysFromSavePayload,
};
