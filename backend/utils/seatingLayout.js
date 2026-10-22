function normalizeBenchConfig(rawBenchConfig, fallbackCols = 0) {
  if (rawBenchConfig && typeof rawBenchConfig === "object" && !Array.isArray(rawBenchConfig)) {
    if (Array.isArray(rawBenchConfig.rowConfigs) && rawBenchConfig.rowConfigs.length > 0) {
      const first = rawBenchConfig.rowConfigs[0];
      if (Array.isArray(first) && first.length > 0) {
        return first.map((n) => Number(n) || 2);
      }
    }
  }
  if (Array.isArray(rawBenchConfig) && rawBenchConfig.length > 0) {
    return rawBenchConfig.map((n) => Number(n) || 2);
  }
  if (fallbackCols > 0) return Array(fallbackCols).fill(2);
  return [];
}

/**
 * Resolve per-row seat configs from stored bench_config (legacy array or v2 object).
 */
function resolveRowConfigs(rawBenchConfig, arrangementRows = 0, fallbackCols = 0) {
  if (rawBenchConfig && typeof rawBenchConfig === "object" && !Array.isArray(rawBenchConfig)) {
    if (Array.isArray(rawBenchConfig.rowConfigs) && rawBenchConfig.rowConfigs.length > 0) {
      return rawBenchConfig.rowConfigs.map((row) =>
        Array.isArray(row) ? row.map((n) => Number(n) || 2) : []
      );
    }
  }

  const benchConfig = normalizeBenchConfig(rawBenchConfig, fallbackCols);
  const rows = Math.max(
    arrangementRows,
    Number.isFinite(Number(rawBenchConfig?.benchesRow))
      ? Number(rawBenchConfig.benchesRow)
      : 0,
    1
  );
  if (!benchConfig.length) {
    return Array.from({ length: rows }, () =>
      fallbackCols > 0 ? Array(fallbackCols).fill(2) : []
    );
  }
  return Array.from({ length: Math.max(rows, 1) }, () => [...benchConfig]);
}

function seatsForCell(rowConfigs, benchConfig, r, c) {
  if (Array.isArray(rowConfigs?.[r]) && rowConfigs[r][c] != null) {
    return Number(rowConfigs[r][c]) || 2;
  }
  return Number(benchConfig?.[c] ?? 2) || 2;
}

function flattenArrangementForStorage(seatingArrangement, benchConfig) {
  if (!Array.isArray(seatingArrangement)) return [];
  const entries = [];
  const rowConfigs = resolveRowConfigs(
    benchConfig,
    seatingArrangement.length,
    seatingArrangement[0]?.length || 0
  );
  const flatBench = normalizeBenchConfig(
    benchConfig,
    seatingArrangement[0]?.length || 0
  );

  for (let r = 0; r < seatingArrangement.length; r++) {
    const row = seatingArrangement[r];
    if (!Array.isArray(row)) continue;

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      const seatsInCol = seatsForCell(rowConfigs, flatBench, r, c);

      if (Array.isArray(cell)) {
        for (let s = 0; s < seatsInCol; s++) {
          const item = cell[s];
          const regNo = (item?.regn_no ?? item?.regnNo ?? "").toString().trim();
          if (!regNo) continue;
          entries.push([r, c, s, regNo]);
        }
      } else if (typeof cell === "string" && cell && cell !== "Empty") {
        const studentsInCell = cell.split("\n").map((x) => x.trim()).filter(Boolean);
        for (let s = 0; s < Math.min(studentsInCell.length, seatsInCol); s++) {
          entries.push([r, c, s, studentsInCell[s]]);
        }
      }
    }
  }

  return entries;
}

function hydrateArrangementFromRows(seatRows, benchConfig, studentCourseMap = new Map()) {
  if (!Array.isArray(seatRows) || seatRows.length === 0) return [];

  const maxR = Math.max(...seatRows.map((s) => (s.seat_row ?? s.seatrow ?? 0))) + 1;
  const maxCFromRows = Math.max(...seatRows.map((s) => (s.seat_col ?? s.seatcol ?? 0))) + 1;
  const rowConfigs = resolveRowConfigs(benchConfig, maxR, maxCFromRows);
  const flatBench = normalizeBenchConfig(benchConfig, maxCFromRows);
  const numCols = Math.max(
    maxCFromRows,
    flatBench.length,
    ...rowConfigs.map((r) => (Array.isArray(r) ? r.length : 0))
  );
  const numRows = Math.max(maxR, rowConfigs.length);

  const grid = Array.from({ length: numRows }, (_, r) =>
    Array.from({ length: numCols }, (_, c) =>
      Array.from(
        { length: seatsForCell(rowConfigs, flatBench, r, c) },
        () => null
      )
    )
  );

  seatRows.forEach((s) => {
    const r = s.seat_row ?? s.seatrow ?? 0;
    const c = s.seat_col ?? s.seatcol ?? 0;
    const seatIndex = s.seat_index ?? s.seatindex ?? 0;
    const regn = s.regn_no ?? s.regnno ?? "";
    const course = studentCourseMap.get(regn) || null;

    if (!grid[r] || !grid[r][c]) return;
    if (seatIndex < 0 || seatIndex >= grid[r][c].length) return;

    grid[r][c][seatIndex] = { regn_no: regn, course };
  });

  return grid.map((row) =>
    row.map((cell) => (cell.some(Boolean) ? cell : "Empty"))
  );
}

module.exports = {
  normalizeBenchConfig,
  resolveRowConfigs,
  flattenArrangementForStorage,
  hydrateArrangementFromRows,
};
