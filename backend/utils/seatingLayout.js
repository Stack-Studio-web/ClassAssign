function normalizeBenchConfig(rawBenchConfig, fallbackCols = 0) {
  if (Array.isArray(rawBenchConfig) && rawBenchConfig.length > 0) {
    return rawBenchConfig.map((n) => Number(n) || 2);
  }
  if (fallbackCols > 0) return Array(fallbackCols).fill(2);
  return [];
}

function flattenArrangementForStorage(seatingArrangement, benchConfig) {
  if (!Array.isArray(seatingArrangement)) return [];
  const entries = [];

  for (let r = 0; r < seatingArrangement.length; r++) {
    const row = seatingArrangement[r];
    if (!Array.isArray(row)) continue;

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      const seatsInCol = Number(benchConfig?.[c] ?? 2) || 2;

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
  const numCols = Math.max(maxCFromRows, benchConfig?.length || 0);

  const grid = Array.from({ length: maxR }, () =>
    Array.from({ length: numCols }, (_, c) =>
      Array.from({ length: Number(benchConfig?.[c] ?? 2) || 2 }, () => null)
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
  flattenArrangementForStorage,
  hydrateArrangementFromRows,
};
