/**
 * Venue bulk-import parsing & validation.
 * Required columns: Venue Name | Type | Rows | Columns | Bench Config
 * Optional column: Block (backward compatible when omitted)
 */

const ALLOWED_TYPES = new Set(["classroom", "lab", "hall"]);

function cell(row, ...keys) {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== "") return row[key];
  }
  return "";
}

function parseVenueRow(row, rowNum) {
  const errors = [];

  const name = String(cell(row, "Venue Name", "venueName", "venue_name", "Name") || "").trim();
  const typeRaw = String(cell(row, "Type", "type") || "").trim();
  const type = typeRaw.toLowerCase();
  const blockName = String(
    cell(row, "Block", "block", "Block Name", "blockName", "block_name") || ""
  ).trim();
  const rowsRaw = cell(row, "Rows", "rows", "benchesRow", "benches_row");
  const colsRaw = cell(row, "Columns", "columns", "Cols", "benchesCol", "benches_col");
  const benchConfigStr = String(
    cell(row, "Bench Config", "benchConfig", "bench_config", "BenchConfig") || ""
  ).trim();

  if (!name) errors.push("Venue Name is required.");
  if (!typeRaw) {
    errors.push("Type is required.");
  } else if (!ALLOWED_TYPES.has(type)) {
    errors.push(`Invalid type "${typeRaw}". Must be: classroom, lab, or hall.`);
  }

  const benchesRow = Number.parseInt(String(rowsRaw).trim(), 10);
  const benchesCol = Number.parseInt(String(colsRaw).trim(), 10);

  if (rowsRaw === "" || Number.isNaN(benchesRow) || benchesRow <= 0) {
    errors.push("Rows must be a positive integer.");
  }
  if (colsRaw === "" || Number.isNaN(benchesCol) || benchesCol <= 0) {
    errors.push("Columns must be a positive integer.");
  }

  let benchConfig = [];
  if (!benchConfigStr) {
    errors.push("Bench Config is required.");
  } else {
    try {
      benchConfig = benchConfigStr.split(",").map((token) => {
        const trimmed = token.trim();
        if (!trimmed) {
          throw new Error("Bench Config contains an empty value.");
        }
        if (/\s/.test(trimmed)) {
          throw new Error(
            `Invalid Bench Config token "${trimmed}" — contains a space. Use comma-separated 2 or 3 values only.`
          );
        }
        const num = Number.parseInt(trimmed, 10);
        if (Number.isNaN(num)) {
          throw new Error(`Invalid Bench Config token "${trimmed}". Expected 2 or 3.`);
        }
        return num;
      });
    } catch (err) {
      errors.push(err.message);
      benchConfig = [];
    }

    if (benchConfig.length && !Number.isNaN(benchesCol) && benchesCol > 0) {
      if (benchConfig.length !== benchesCol) {
        errors.push(
          `Bench Config has ${benchConfig.length} value(s) but Columns is ${benchesCol}. They must match.`
        );
      }
      const invalidSeats = benchConfig.filter((s) => s !== 2 && s !== 3);
      if (invalidSeats.length > 0) {
        errors.push(
          `Invalid seat counts in Bench Config: [${invalidSeats.join(", ")}]. Only 2 or 3 allowed.`
        );
      }
    }
  }

  const capacity =
    !errors.length && benchesRow > 0 && benchConfig.length
      ? benchesRow * benchConfig.reduce((sum, seats) => sum + seats, 0)
      : 0;

  return {
    rowNum,
    name,
    type: ALLOWED_TYPES.has(type) ? type : typeRaw,
    blockName: blockName || null,
    benchesRow: Number.isNaN(benchesRow) ? null : benchesRow,
    benchesCol: Number.isNaN(benchesCol) ? null : benchesCol,
    benchConfig,
    capacity,
    errors,
  };
}

/**
 * @param {object[]} rawRows
 * @param {object} helpers
 * @param {function} helpers.venueExists
 * @param {function} [helpers.findExistingVenue] - returns { uuid, name, type, blockName, blockUuid }
 */
async function validateVenueRows(rawRows, helpers = {}) {
  const { venueExists, findExistingVenue } = helpers;
  const preview = [];
  const seenKeys = new Set();
  let validCount = 0;
  let errorCount = 0;
  let duplicateCount = 0;
  let hasBlockColumn = false;

  for (let i = 0; i < rawRows.length; i++) {
    const headers = Object.keys(rawRows[i] || {});
    if (
      headers.some((h) =>
        ["block", "block name", "blockname", "block_name"].includes(String(h).toLowerCase().trim())
      )
    ) {
      hasBlockColumn = true;
    }
  }

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2;
    const parsed = parseVenueRow(rawRows[i], rowNum);

    const empty =
      !parsed.name &&
      !parsed.type &&
      !parsed.blockName &&
      parsed.benchesRow == null &&
      parsed.benchesCol == null &&
      !(parsed.benchConfig && parsed.benchConfig.length);
    if (empty) continue;

    if (parsed.blockName) hasBlockColumn = true;

    let existing = null;
    let isDuplicate = false;

    if (parsed.name && parsed.type && ALLOWED_TYPES.has(parsed.type)) {
      const key = `${parsed.name.toUpperCase()}::${parsed.type}`;
      if (seenKeys.has(key)) {
        parsed.errors.push(
          `Duplicate row in file: venue "${parsed.name}" with type "${parsed.type}" appears more than once.`
        );
      } else {
        seenKeys.add(key);
      }

      if (
        typeof findExistingVenue === "function" &&
        !parsed.errors.some((e) => e.includes("Duplicate row"))
      ) {
        existing = await findExistingVenue(parsed.name, parsed.type);
        if (existing) {
          isDuplicate = true;
          parsed.errors.push(
            `Venue "${parsed.name}" (${parsed.type}) already exists.` +
              (existing.blockName ? ` Existing Block: ${existing.blockName}.` : "")
          );
        }
      } else if (
        typeof venueExists === "function" &&
        !parsed.errors.some((e) => e.includes("Duplicate row"))
      ) {
        const exists = await venueExists(parsed.name, parsed.type);
        if (exists) {
          isDuplicate = true;
          parsed.errors.push(`Venue "${parsed.name}" (${parsed.type}) already exists.`);
        }
      }
    }

    // Soft-duplicate (already in DB) vs hard validation error
    const hardErrors = parsed.errors.filter(
      (e) => !String(e).includes("already exists")
    );
    let status = "VALID";
    if (hardErrors.length) {
      status = "ERROR";
      errorCount += 1;
    } else if (isDuplicate) {
      status = "DUPLICATE";
      duplicateCount += 1;
    } else {
      validCount += 1;
    }

    preview.push({
      rowNum: parsed.rowNum,
      name: parsed.name,
      type: parsed.type,
      blockName: parsed.blockName,
      benchesRow: parsed.benchesRow,
      benchesCol: parsed.benchesCol,
      benchConfig: parsed.benchConfig,
      capacity: parsed.capacity,
      status,
      isDuplicate,
      existing: existing
        ? {
            uuid: existing.uuid,
            blockName: existing.blockName || null,
            blockUuid: existing.blockUuid || null,
          }
        : null,
      errors: parsed.errors,
      error: parsed.errors[0] || null,
    });
  }

  // Import allowed when there are valid rows, or only soft-duplicates (handled at import time)
  const canImport = preview.length > 0 && errorCount === 0 && (validCount > 0 || duplicateCount > 0);

  return {
    rows: preview,
    validCount,
    errorCount,
    duplicateCount,
    total: preview.length,
    hasBlockColumn,
    canImport,
    message:
      preview.length === 0
        ? "No venue rows found in the file."
        : errorCount > 0
          ? "Import blocked. Please correct the errors before importing."
          : duplicateCount > 0 && validCount === 0
            ? `All ${duplicateCount} venue(s) already exist. Choose how to handle duplicates, then Import.`
            : duplicateCount > 0
              ? `${validCount} new venue(s) ready; ${duplicateCount} duplicate(s) will use your duplicate action.`
              : "All venue records validated successfully.",
  };
}

module.exports = {
  ALLOWED_TYPES,
  parseVenueRow,
  validateVenueRows,
};
