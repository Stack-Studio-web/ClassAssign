import * as XLSX from 'xlsx'

/** Map common header aliases → canonical field. */
const HEADER_MAP = {
  venue_id: 'venue_id',
  venueid: 'venue_id',
  id: 'venue_id',
  hall_id: 'venue_id',
  room_id: 'venue_id',
  venue_name: 'venue_name',
  venuename: 'venue_name',
  name: 'venue_name',
  hall_name: 'venue_name',
  room: 'venue_name',
  room_no: 'venue_name',
  room_number: 'venue_name',
  benches_row: 'benches_row',
  benchesrow: 'benches_row',
  rows: 'benches_row',
  row: 'benches_row',
  benches_col: 'benches_col',
  benchescol: 'benches_col',
  columns: 'benches_col',
  cols: 'benches_col',
  col: 'benches_col',
  bench_config: 'bench_config',
  benchconfig: 'bench_config',
  config: 'bench_config',
  seats_per_bench: 'bench_config',
}

function normalizeHeader(h) {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

/** Parse "2,2,3,2" or "[2, 2, 3, 2]" → number[]. */
export function parseBenchConfig(raw) {
  return String(raw || '')
    .replace(/[\[\]]/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => Number(s))
}

/**
 * @returns {{ venues: Array, error?: string }}
 */
export function parseVenuesWorkbook(buffer) {
  let workbook
  try {
    workbook = XLSX.read(buffer, { type: 'array' })
  } catch {
    return { venues: [], error: 'Could not read the file. Use .xlsx, .xls, or .csv.' }
  }

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { venues: [], error: 'Workbook has no sheets.' }
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: '',
    raw: false,
  })
  if (rows.length === 0) {
    return { venues: [], error: 'Sheet is empty. Add a header row and venue data.' }
  }

  const sample = rows[0]
  const fieldByCol = {}
  for (const key of Object.keys(sample)) {
    const canon = HEADER_MAP[normalizeHeader(key)]
    if (canon) fieldByCol[key] = canon
  }

  const mapped = new Set(Object.values(fieldByCol))
  for (const need of [
    'venue_id',
    'venue_name',
    'benches_row',
    'benches_col',
    'bench_config',
  ]) {
    if (!mapped.has(need)) {
      return {
        venues: [],
        error:
          'Missing required column. Expected: venue_id, venue_name, benches_row, benches_col, bench_config.',
      }
    }
  }

  const venues = []
  const seenIds = new Set()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const raw = {
      venue_id: '',
      venue_name: '',
      benches_row: '',
      benches_col: '',
      bench_config: '',
    }
    for (const [col, field] of Object.entries(fieldByCol)) {
      raw[field] = String(row[col] ?? '').trim()
    }

    if (
      !raw.venue_id &&
      !raw.venue_name &&
      !raw.benches_row &&
      !raw.benches_col &&
      !raw.bench_config
    ) {
      continue
    }

    const benches_row = Number(raw.benches_row)
    const benches_col = Number(raw.benches_col)
    const bench_config = parseBenchConfig(raw.bench_config)

    if (!raw.venue_id || !raw.venue_name) {
      return {
        venues: [],
        error: `Row ${i + 2}: venue_id and venue_name are required.`,
      }
    }
    if (!Number.isInteger(benches_row) || benches_row < 1) {
      return {
        venues: [],
        error: `Row ${i + 2}: benches_row must be an integer ≥ 1.`,
      }
    }
    if (!Number.isInteger(benches_col) || benches_col < 1) {
      return {
        venues: [],
        error: `Row ${i + 2}: benches_col must be an integer ≥ 1.`,
      }
    }
    if (
      bench_config.length === 0 ||
      bench_config.some((n) => !Number.isInteger(n) || n < 1)
    ) {
      return {
        venues: [],
        error: `Row ${i + 2}: bench_config must be positive integers, e.g. 2,2,2,2,2`,
      }
    }
    if (bench_config.length !== benches_col) {
      return {
        venues: [],
        error: `Row ${i + 2}: bench_config has ${bench_config.length} values but benches_col is ${benches_col}.`,
      }
    }
    if (seenIds.has(raw.venue_id)) {
      return {
        venues: [],
        error: `Duplicate venue_id "${raw.venue_id}" at row ${i + 2}.`,
      }
    }
    seenIds.add(raw.venue_id)
    venues.push({
      venue_id: raw.venue_id,
      venue_name: raw.venue_name,
      benches_row,
      benches_col,
      bench_config,
    })
  }

  if (venues.length === 0) {
    return { venues: [], error: 'No venue rows found under the header.' }
  }

  return { venues }
}

/** Venues from the demo hall list (rooms 201–311). */
export const SAMPLE_VENUE_ROWS = [
  { venue_id: 'V3', venue_name: '201', benches_row: 7, benches_col: 5, bench_config: '2,2,2,2,2' },
  { venue_id: 'V4', venue_name: '202', benches_row: 7, benches_col: 5, bench_config: '2,2,2,2,2' },
  { venue_id: 'V5', venue_name: '205', benches_row: 6, benches_col: 4, bench_config: '3,3,3,3' },
  { venue_id: 'V6', venue_name: '206', benches_row: 6, benches_col: 4, bench_config: '3,3,3,3' },
  { venue_id: 'V7', venue_name: '207', benches_row: 8, benches_col: 4, bench_config: '2,3,3,2' },
  { venue_id: 'V8', venue_name: '208', benches_row: 7, benches_col: 5, bench_config: '2,2,2,2,2' },
  { venue_id: 'V9', venue_name: '209', benches_row: 7, benches_col: 4, bench_config: '2,3,3,2' },
  { venue_id: 'V10', venue_name: '210', benches_row: 7, benches_col: 5, bench_config: '2,2,2,2,2' },
  { venue_id: 'V11', venue_name: '211', benches_row: 7, benches_col: 5, bench_config: '2,2,2,2,2' },
  { venue_id: 'V12', venue_name: '311', benches_row: 7, benches_col: 5, bench_config: '2,2,2,2,2' },
  { venue_id: 'V13', venue_name: '305', benches_row: 6, benches_col: 4, bench_config: '3,3,3,3' },
  { venue_id: 'V14', venue_name: '306', benches_row: 6, benches_col: 4, bench_config: '3,3,3,3' },
]

export function downloadVenuesTemplate() {
  const sheet = XLSX.utils.json_to_sheet(SAMPLE_VENUE_ROWS)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Venues')
  XLSX.writeFile(book, 'venue_table.xlsx')
}
