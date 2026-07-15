import { useRef, useState } from 'react'
import {
  downloadVenuesTemplate,
  parseBenchConfig,
  parseVenuesWorkbook,
} from '../utils/parseVenuesExcel'

function emptyDraft() {
  return {
    venue_name: '',
    benches_row: 3,
    benches_col: 3,
    bench_config_str: '2,2,2',
  }
}

/**
 * Load venues from Excel upload (primary) with optional manual add.
 * Columns: venue_id, venue_name, benches_row, benches_col, bench_config
 */
export default function VenueForm({ venues, onChange }) {
  const inputRef = useRef(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [seq, setSeq] = useState(100)
  const [showManual, setShowManual] = useState(false)

  async function handleFile(file) {
    setError('')
    if (!file) return

    const lower = file.name.toLowerCase()
    if (!/\.(xlsx|xls|csv)$/.test(lower)) {
      setError('Please upload an .xlsx, .xls, or .csv file.')
      return
    }

    setLoading(true)
    try {
      const buffer = await file.arrayBuffer()
      const { venues: list, error: parseError } = parseVenuesWorkbook(buffer)
      if (parseError) {
        setError(parseError)
        setFileName('')
        return
      }
      setFileName(file.name)
      onChange(list)
      const maxNum = list.reduce((m, v) => {
        const n = Number(String(v.venue_id).replace(/^V/i, ''))
        return Number.isFinite(n) ? Math.max(m, n) : m
      }, 0)
      setSeq(maxNum + 1)
    } catch {
      setError('Failed to read the file.')
      setFileName('')
    } finally {
      setLoading(false)
    }
  }

  function addVenue(e) {
    e.preventDefault()
    setError('')
    const name = draft.venue_name.trim()
    const rows = Number(draft.benches_row)
    const cols = Number(draft.benches_col)
    const cfg = parseBenchConfig(draft.bench_config_str)

    if (!name) {
      setError('Venue name is required.')
      return
    }
    if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(cols) || cols < 1) {
      setError('Rows and columns must be integers ≥ 1.')
      return
    }
    if (cfg.length === 0 || cfg.some((n) => !Number.isInteger(n) || n < 1)) {
      setError('bench_config must be positive integers, e.g. 2,2,3,2')
      return
    }
    if (cfg.length !== cols) {
      setError(`bench_config has ${cfg.length} values but benches_col is ${cols}.`)
      return
    }

    const venue = {
      venue_id: `V${seq}`,
      venue_name: name,
      benches_row: rows,
      benches_col: cols,
      bench_config: cfg,
    }
    onChange([...venues, venue])
    setSeq((s) => s + 1)
    setDraft(emptyDraft())
  }

  function removeVenue(id) {
    onChange(venues.filter((v) => v.venue_id !== id))
  }

  function clearAll() {
    setError('')
    setFileName('')
    onChange([])
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900">Venues</h2>
      <p className="mt-1 mb-4 text-sm text-slate-500">
        Upload an Excel file with columns{' '}
        <code className="rounded bg-slate-100 px-1 text-xs text-slate-700">
          venue_id
        </code>
        ,{' '}
        <code className="rounded bg-slate-100 px-1 text-xs text-slate-700">
          venue_name
        </code>
        ,{' '}
        <code className="rounded bg-slate-100 px-1 text-xs text-slate-700">
          benches_row
        </code>
        ,{' '}
        <code className="rounded bg-slate-100 px-1 text-xs text-slate-700">
          benches_col
        </code>
        ,{' '}
        <code className="rounded bg-slate-100 px-1 text-xs text-slate-700">
          bench_config
        </code>
        .
      </p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <label className="flex flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 transition hover:border-blue-400 hover:bg-blue-50/40">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="sr-only"
            disabled={loading}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <span className="text-sm font-semibold text-slate-800">
            {loading ? 'Reading file…' : 'Choose Excel / CSV file'}
          </span>
          <span className="mt-1 text-xs text-slate-500">
            .xlsx, .xls, or .csv
          </span>
          {fileName && (
            <span className="mt-3 max-w-full truncate rounded-md bg-white px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-100">
              {fileName}
            </span>
          )}
        </label>

        <div className="flex shrink-0 flex-col gap-2 sm:w-52">
          <a
            href="/venue_table.xlsx"
            download
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Sample Excel (12 halls)
          </a>
          <button
            type="button"
            onClick={downloadVenuesTemplate}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Download template
          </button>
          {venues.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Clear venues
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            {showManual ? 'Hide manual add' : 'Add venue manually'}
          </button>
        </div>
      </div>

      {showManual && (
        <form onSubmit={addVenue} className="mt-5 space-y-4 border-t border-slate-100 pt-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <label className="col-span-2 flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-600">Venue name</span>
              <input
                type="text"
                value={draft.venue_name}
                onChange={(e) => setDraft({ ...draft, venue_name: e.target.value })}
                placeholder="201"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-600">Rows</span>
              <input
                type="number"
                min={1}
                value={draft.benches_row}
                onChange={(e) => setDraft({ ...draft, benches_row: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-600">Columns</span>
              <input
                type="number"
                min={1}
                value={draft.benches_col}
                onChange={(e) => setDraft({ ...draft, benches_col: e.target.value })}
              />
            </label>
            <label className="col-span-2 md:col-span-4 flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-600">
                bench_config{' '}
                <span className="font-normal text-slate-400">(comma-separated)</span>
              </span>
              <input
                type="text"
                className="font-mono"
                value={draft.bench_config_str}
                onChange={(e) =>
                  setDraft({ ...draft, bench_config_str: e.target.value })
                }
                placeholder="2,2,2,2,2"
              />
            </label>
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Add venue
          </button>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {venues.length > 0 && (
        <ul className="mt-5 space-y-2 border-t border-slate-100 pt-5">
          {venues.map((v) => {
            const cap = v.benches_row * v.bench_config.reduce((a, b) => a + b, 0)
            return (
              <li
                key={v.venue_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {v.venue_name}
                    </span>
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                      {v.venue_id}
                    </span>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                      {cap} seats
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {v.benches_row}×{v.benches_col} · config [{v.bench_config.join(', ')}]
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeVenue(v.venue_id)}
                  className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:border-red-200"
                >
                  Delete
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
