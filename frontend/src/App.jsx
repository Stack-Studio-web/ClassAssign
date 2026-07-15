import { useState } from 'react'
import VenueForm from './components/VenueForm'
import StudentInput from './components/StudentInput'
import ResultsSummary from './components/ResultsSummary'
import SeatingGrid from './components/SeatingGrid'
import { generateSeating } from './api'
import { API_BASE_URL } from './config'

const SAMPLE_VENUES = []

export default function App() {
  const [venues, setVenues] = useState(SAMPLE_VENUES)
  const [students, setStudents] = useState([])
  const [allowOverride, setAllowOverride] = useState(false)
  const [venueFillOrder, setVenueFillOrder] = useState('high_to_low')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [highlightViolations, setHighlightViolations] = useState(true)

  const capacity = venues.reduce(
    (sum, v) => sum + v.benches_row * v.bench_config.reduce((a, b) => a + b, 0),
    0
  )

  async function handleGenerate() {
    setError('')
    setResult(null)
    if (venues.length === 0) {
      setError('Upload a venue Excel file first.')
      return
    }
    if (students.length === 0) {
      setError('Upload a student Excel file first.')
      return
    }

    setLoading(true)
    const res = await generateSeating({
      venues,
      students,
      allow_adjacent_override: allowOverride,
      venue_fill_order: venueFillOrder,
    })
    setLoading(false)

    if (!res.ok) {
      setError(res.error)
      return
    }
    setResult(res.data)
    if (res.data.adjacency_violations?.length) {
      setHighlightViolations(true)
    }
  }

  function downloadJson() {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `seating-${result.status.toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-6">
        <header className="no-print border-b border-slate-200 pb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
            OR-Tools CP-SAT
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            Exam Seating Demo
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Sends venues + students to{' '}
            <code className="rounded bg-white border border-slate-200 px-1.5 py-0.5 text-xs text-slate-700">
              {API_BASE_URL}/generate-seating
            </code>{' '}
            and renders hall grids. Same course = same color; same department is
            stacked down columns with sequential roll numbers for attendance.
          </p>
        </header>

        <div className="no-print space-y-6">
          <VenueForm venues={venues} onChange={setVenues} />
          <StudentInput students={students} onChange={setStudents} />

          <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900">Options</h2>

            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-slate-800">
                Venue fill order
              </legend>
              <p className="mt-1 text-sm text-slate-500">
                Always opens the fewest halls needed to seat everyone under
                adjacency rules. Fill order only chooses which of those halls
                are preferred (largest or smallest first).
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:gap-6">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="venueFillOrder"
                    checked={venueFillOrder === 'high_to_low'}
                    onChange={() => setVenueFillOrder('high_to_low')}
                  />
                  High → low capacity (largest halls first)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="venueFillOrder"
                    checked={venueFillOrder === 'low_to_high'}
                    onChange={() => setVenueFillOrder('low_to_high')}
                  />
                  Low → high capacity (smallest halls first)
                </label>
              </div>
            </fieldset>

            <label className="mt-5 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={allowOverride}
                onChange={(e) => setAllowOverride(e.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">
                  Allow adjacent override
                </span>
                <span className="mt-0.5 block text-sm text-slate-500">
                  If a hard adjacency-safe plan is infeasible, relax same-course
                  horizontal adjacency to a soft penalty and flag violations.
                </span>
              </span>
            </label>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500 order-2 sm:order-1">
                {venues.length} venue(s) · {students.length} student(s) · capacity{' '}
                {capacity}
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={handleGenerate}
                className="order-1 sm:order-2 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
              >
                {loading && (
                  <span
                    className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin"
                    aria-hidden
                  />
                )}
                {loading ? 'Solving…' : 'Generate Seating'}
              </button>
            </div>

            {error && (
              <div
                className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                role="alert"
              >
                {error}
              </div>
            )}
          </section>
        </div>

        {result && (
          <div className="space-y-6">
            <ResultsSummary
              result={result}
              studentCount={students.length}
              highlightViolations={highlightViolations}
              onToggleHighlight={setHighlightViolations}
              onDownloadJson={downloadJson}
            />
            <SeatingGrid
              venuesUsed={result.venues_used}
              violations={result.adjacency_violations}
              highlightViolations={highlightViolations}
              result={result}
            />
          </div>
        )}
      </div>
    </div>
  )
}
