/**
 * Venue bulk-import parsing & validation (Phase 2).
 *
 * Columns:
 *   Block Code | Block Name | Venue Name | Venue Type | Rows | Columns |
 *   Bench Configuration | Available
 *
 * Rules:
 *   - Block Code must match an existing block (no auto-create)
 *   - Block Name validated against existing block name when provided
 *   - createdBy / owner never accepted from Excel
 *   - Capacity derived from Rows × sum(Bench Configuration) — same as manual create
 *   - Existing venues are rejected (no upsert); ownership bypass via import is denied
 */

const ALLOWED_TYPES = new Set(["classroom", "lab", "hall"]);

function cell(row, ...keys) {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== "") return row[key];
  }
  return "";
}

function parseAvailable(raw) {
  if (raw === "" || raw == null) return { value: true, error: null };
  const s = String(raw).trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(s)) return { value: true, error: null };
  if (["false", "no", "n", "0"].includes(s)) return { value: false, error: null };
  return {
    value: null,
    error: `Invalid Available value "${raw}". Use TRUE/FALSE or Yes/No.`,
  };
}

function normalizeType(typeRaw) {
  return String(typeRaw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function parseVenueRow(row, rowNum) {
  const errors = [];

  const blockCode = String(
    cell(row, "Block Code", "blockCode", "block_code", "BlockCode") || ""
  )
    .trim()
    .toUpperCase();
  const blockName = String(
    cell(row, "Block Name", "blockName", "block_name", "BlockName") || ""
  ).trim();
  const name = String(
    cell(row, "Venue Name", "venueName", "venue_name", "Name") || ""
  ).trim();
  const typeRaw = String(
    cell(row, "Venue Type", "Type", "type", "venueType", "venue_type") || ""
  ).trim();
  const type = normalizeType(typeRaw);
  const rowsRaw = cell(row, "Rows", "rows", "benchesRow", "benches_row");
  const colsRaw = cell(row, "Columns", "columns", "Cols", "benchesCol", "benches_col");
  const benchConfigStr = String(
    cell(
      row,
      "Bench Configuration",
      "Bench Config",
      "benchConfig",
      "bench_config",
      "BenchConfig"
    ) || ""
  ).trim();
  const availableRaw = cell(row, "Available", "available", "isAvailable", "is_available");

  if (!blockCode) errors.push("Block Code is required.");
  if (!name) errors.push("Venue Name is required.");
  if (!typeRaw) {
    errors.push("Venue Type is required.");
  } else if (!ALLOWED_TYPES.has(type)) {
    errors.push(`Invalid Venue Type "${typeRaw}". Must be: classroom, lab, or hall.`);
  }

  const benchesRow = Number.parseInt(String(rowsRaw).trim(), 10);
  const benchesCol = Number.parseInt(String(colsRaw).trim(), 10);

  if (rowsRaw === "" || Number.isNaN(benchesRow) || benchesRow <= 0) {
    errors.push("Rows must be greater than 0.");
  }
  if (colsRaw === "" || Number.isNaN(benchesCol) || benchesCol <= 0) {
    errors.push("Columns must be greater than 0.");
  }

  let benchConfig = [];
  if (!benchConfigStr) {
    errors.push("Bench Configuration is required.");
  } else {
    try {
      benchConfig = benchConfigStr.split(",").map((token) => {
        const trimmed = token.trim();
        if (!trimmed) {
          throw new Error("Bench Configuration contains an empty value.");
        }
        if (/\s/.test(trimmed)) {
          throw new Error(
            `Invalid Bench Configuration token "${trimmed}" — contains a space. Use comma-separated 2 or 3 values only.`
          );
        }
        const num = Number.parseInt(trimmed, 10);
        if (Number.isNaN(num)) {
          throw new Error(`Invalid Bench Configuration token "${trimmed}". Expected 2 or 3.`);
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
          `Bench Configuration has ${benchConfig.length} value(s) but Columns is ${benchesCol}. They must match.`
        );
      }
      const invalidSeats = benchConfig.filter((s) => s !== 2 && s !== 3);
      if (invalidSeats.length > 0) {
        errors.push(
          `Invalid seat counts in Bench Configuration: [${invalidSeats.join(", ")}]. Only 2 or 3 allowed.`
        );
      }
    }
  }

  const availableParsed = parseAvailable(availableRaw);
  if (availableParsed.error) errors.push(availableParsed.error);

  const capacity =
    !errors.length && benchesRow > 0 && benchConfig.length
      ? benchesRow * benchConfig.reduce((sum, seats) => sum + seats, 0)
      : 0;

  return {
    rowNum,
    blockCode,
    blockName,
    name,
    type: ALLOWED_TYPES.has(type) ? type : typeRaw,
    benchesRow: Number.isNaN(benchesRow) ? null : benchesRow,
    benchesCol: Number.isNaN(benchesCol) ? null : benchesCol,
    benchConfig,
    capacity,
    isAvailable: availableParsed.value !== null ? availableParsed.value : true,
    errors,
  };
}

/**
 * @param {object[]} rawRows
 * @param {object} helpers
 * @param {(code: string) => Promise<object|null>} helpers.findBlockByCode
 * @param {(name: string, type: string) => Promise<object|null>} helpers.findExistingVenue
 * @param {(user: object, venueRow: object) => boolean} [helpers.canManageVenue]
 * @param {object} [helpers.user] authenticated user for ownership messaging
 */
async function validateVenueRows(rawRows, helpers = {}) {
  const { findBlockByCode, findExistingVenue, canManageVenue, user } = helpers;
  const preview = [];
  const seenKeys = new Set();
  let validCount = 0;
  let errorCount = 0;
  let duplicateCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2;
    const parsed = parseVenueRow(rawRows[i], rowNum);

    const empty =
      !parsed.blockCode &&
      !parsed.blockName &&
      !parsed.name &&
      !parsed.type &&
      parsed.benchesRow == null &&
      parsed.benchesCol == null &&
      !(parsed.benchConfig && parsed.benchConfig.length);
    if (empty) continue;

    let blockId = null;
    let resolvedBlockName = null;
    let resolvedBlockCode = null;

    if (parsed.blockCode && typeof findBlockByCode === "function") {
      const block = await findBlockByCode(parsed.blockCode);
      if (!block) {
        parsed.errors.push(`Block code '${parsed.blockCode}' does not exist.`);
      } else {
        blockId = block.id;
        resolvedBlockName = block.name;
        resolvedBlockCode = block.code;
        if (
          parsed.blockName &&
          String(parsed.blockName).trim().toUpperCase() !==
            String(block.name || "").trim().toUpperCase()
        ) {
          parsed.errors.push(
            `Block Name "${parsed.blockName}" does not match existing block "${block.name}" for code '${parsed.blockCode}'.`
          );
        }
      }
    }

    if (parsed.name && parsed.type && ALLOWED_TYPES.has(parsed.type)) {
      const key = `${parsed.name.toUpperCase()}::${parsed.type}`;
      if (seenKeys.has(key)) {
        parsed.errors.push(
          `Duplicate row in file: venue "${parsed.name}" with type "${parsed.type}" appears more than once.`
        );
        duplicateCount += 1;
      } else {
        seenKeys.add(key);
      }

      if (
        typeof findExistingVenue === "function" &&
        !parsed.errors.some((e) => e.includes("Duplicate row"))
      ) {
        const existing = await findExistingVenue(parsed.name, parsed.type);
        if (existing) {
          const manageFn =
            typeof canManageVenue === "function" ? canManageVenue : () => false;
          if (user && !manageFn(user, existing)) {
            parsed.errors.push(
              `You do not have permission to modify this venue.`
            );
          } else {
            parsed.errors.push(`Venue "${parsed.name}" already exists.`);
          }
          duplicateCount += 1;
        }
      }
    }

    const status = parsed.errors.length
      ? parsed.errors.some(
          (e) =>
            e.includes("already exists") ||
            e.includes("Duplicate row") ||
            e.includes("permission to modify")
        )
        ? "DUPLICATE"
        : "ERROR"
      : "VALID";

    if (status === "VALID") validCount += 1;
    else errorCount += 1;

    preview.push({
      rowNum: parsed.rowNum,
      blockCode: resolvedBlockCode || parsed.blockCode,
      blockName: resolvedBlockName || parsed.blockName,
      blockId,
      name: parsed.name,
      type: parsed.type,
      benchesRow: parsed.benchesRow,
      benchesCol: parsed.benchesCol,
      benchConfig: parsed.benchConfig,
      capacity: parsed.capacity,
      isAvailable: parsed.isAvailable,
      status,
      errors: parsed.errors,
      error: parsed.errors[0] || null,
    });
  }

  return {
    rows: preview,
    validCount,
    errorCount,
    duplicateCount,
    total: preview.length,
    canImport: preview.length > 0 && errorCount === 0,
    message:
      preview.length === 0
        ? "No venue rows found in the file."
        : errorCount > 0
          ? "Import blocked. Please correct the errors before importing."
          : "All venue records validated successfully.",
  };
}

module.exports = {
  ALLOWED_TYPES,
  parseVenueRow,
  parseAvailable,
  validateVenueRows,
};
