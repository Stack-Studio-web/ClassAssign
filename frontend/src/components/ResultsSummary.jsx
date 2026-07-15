export default function ResultsSummary({
  result,
  studentCount,
  highlightViolations,
  onToggleHighlight,
  onDownloadJson,
}) {
  if (!result) return null

  const ok = result.status === 'OPTIMAL' || result.status === 'FEASIBLE'
  const seated = studentCount - (result.unseated_students?.length || 0)
  const violCount = result.adjacency_violations?.length || 0

  return (
    <section className="print-break bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Results</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold tracking-wide ${
              ok
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {result.status}
          </span>
          {result.solve_time_seconds != null && (
            <span className="text-sm text-slate-500">
              {result.solve_time_seconds}s
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onDownloadJson}
          className="no-print rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Download JSON
        </button>
      </div>

      {result.message && (
        <p className="mt-3 text-sm text-slate-500">{result.message}</p>
      )}

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Stat label="Total students" value={studentCount} />
        <Stat label="Seated" value={Math.max(0, seated)} accent />
        <Stat
          label="Unseated"
          value={result.unseated_students?.length || 0}
          danger={!ok}
        />
      </div>

      {result.venues_used?.length > 0 && (
        <div className="mt-6 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">Venue fill</h3>
          {result.venues_used.map((v) => {
            const { used, total } = countSeats(v)
            const pct = total ? Math.round((used / total) * 100) : 0
            return (
              <div key={v.venue_id} className="text-sm">
                <div className="mb-1.5 flex justify-between">
                  <span className="font-medium text-slate-700">{v.venue_name}</span>
                  <span className="text-slate-500">
                    {used}/{total} ({pct}%)
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {violCount > 0 && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>{violCount}</strong> adjacency violation seat(s) flagged
              (same-course horizontal neighbors under override).
            </span>
            <label className="no-print flex cursor-pointer items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={highlightViolations}
                onChange={(e) => onToggleHighlight(e.target.checked)}
              />
              Highlight in grids
            </label>
          </div>
        </div>
      )}

      {result.unseated_students?.length > 0 && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Unseated:</strong> {result.unseated_students.join(', ')}
        </div>
      )}
    </section>
  )
}

function Stat({ label, value, accent, danger }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-center">
      <div
        className={`text-2xl font-bold tabular-nums ${
          danger
            ? 'text-red-600'
            : accent
              ? 'text-blue-600'
              : 'text-slate-900'
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs font-medium text-slate-500">{label}</div>
    </div>
  )
}

function countSeats(venue) {
  let used = 0
  let total = 0
  const rows = venue.seating_arrangement || []
  for (const row of rows) {
    row.forEach((cell, col) => {
      const slots = venue.bench_config[col] || 0
      total += slots
      if (cell === 'Empty') return
      if (Array.isArray(cell)) {
        used += cell.filter(Boolean).length
      }
    })
  }
  return { used, total }
}
