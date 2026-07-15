import { courseColor } from '../utils/courseColors'

/**
 * Visual seating grid.
 * Tight gap inside a bench (Rule 1); wider gap between benches (Rules 2/3).
 */
export default function SeatingGrid({ venuesUsed, violations, highlightViolations }) {
  if (!venuesUsed?.length) return null

  const violSet = new Set(
    (violations || []).map(
      (v) => `${v.venue_id}|${v.row}|${v.col}|${v.seat_index}`
    )
  )

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-900">Seating layouts</h2>

      {venuesUsed.map((venue) => (
        <article
          key={venue.venue_id}
          className="print-break bg-white rounded-xl shadow-sm border border-slate-200 p-6"
        >
          <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3">
            <h3 className="text-base font-semibold text-slate-900">
              {venue.venue_name}{' '}
              <span className="font-normal text-slate-400">({venue.venue_id})</span>
            </h3>
            <span className="text-xs text-slate-500">
              benches [{venue.bench_config.join(', ')}] · wider gap = bench edge
            </span>
          </header>

          <div className="overflow-x-auto pb-2">
            <div className="inline-flex flex-col gap-3">
              {(venue.seating_arrangement || []).map((row, r) => (
                <div key={r} className="flex items-stretch gap-4">
                  {row.map((cell, c) => {
                    const slots =
                      cell === 'Empty'
                        ? Array.from(
                            { length: venue.bench_config[c] || 0 },
                            () => null
                          )
                        : cell

                    return (
                      <div
                        key={c}
                        className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1.5"
                        title={`Bench column ${c}`}
                      >
                        {(slots || []).map((slot, s) => {
                          const key = `${venue.venue_id}|${r}|${c}|${s}`
                          const isViol = highlightViolations && violSet.has(key)

                          if (!slot) {
                            return (
                              <div
                                key={s}
                                className={`flex h-14 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-100 text-slate-300 ${
                                  isViol ? 'ring-2 ring-red-500' : ''
                                }`}
                              >
                                <span className="text-sm">—</span>
                              </div>
                            )
                          }

                          const color = courseColor(slot.course)
                          return (
                            <div
                              key={s}
                              className={`flex h-14 w-16 flex-col items-center justify-center rounded-lg border px-1 text-center ${color.seat} ${
                                isViol
                                  ? 'ring-2 ring-red-600 ring-offset-1 border-red-600'
                                  : ''
                              }`}
                              title={`${slot.regn_no} · ${slot.course}${
                                isViol ? ' · ADJACENCY VIOLATION' : ''
                              }`}
                            >
                              <span className="text-[10px] font-semibold leading-tight tracking-tight">
                                {slot.regn_no}
                              </span>
                              <span
                                className={`mt-1 rounded px-1 text-[9px] font-bold uppercase leading-none ${color.badge}`}
                              >
                                {slot.course}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          <Legend courses={coursesInVenue(venue)} />
        </article>
      ))}
    </div>
  )
}

function coursesInVenue(venue) {
  const set = new Set()
  for (const row of venue.seating_arrangement || []) {
    for (const cell of row) {
      if (cell === 'Empty' || !Array.isArray(cell)) continue
      for (const slot of cell) {
        if (slot?.course) set.add(slot.course)
      }
    }
  }
  return [...set].sort()
}

function Legend({ courses }) {
  if (!courses.length) return null
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
      <span className="text-xs font-medium text-slate-500">Legend:</span>
      {courses.map((c) => {
        const color = courseColor(c)
        return (
          <span
            key={c}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${color.legend}`}
          >
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${color.dot}`} />
            {c}
          </span>
        )
      })}
    </div>
  )
}
