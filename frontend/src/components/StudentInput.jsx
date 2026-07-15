import { useRef, useState } from 'react'
import { courseColor } from '../utils/courseColors'
import {
  downloadStudentsTemplate,
  parseStudentsWorkbook,
} from '../utils/parseStudentsExcel'

/**
 * Load student roster from an Excel / CSV upload.
 * Required columns: regn_no, course_code, department.
 */
export default function StudentInput({ students, onChange }) {
  const inputRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
      const { students: list, error: parseError } = parseStudentsWorkbook(buffer)
      if (parseError) {
        setError(parseError)
        setFileName('')
        onChange([])
        return
      }
      setFileName(file.name)
      onChange(list)
    } catch {
      setError('Failed to read the file.')
      setFileName('')
      onChange([])
    } finally {
      setLoading(false)
    }
  }

  function clearAll() {
    setError('')
    setFileName('')
    onChange([])
    if (inputRef.current) inputRef.current.value = ''
  }

  const byCourse = students.reduce((acc, s) => {
    acc[s.course_code] = (acc[s.course_code] || 0) + 1
    return acc
  }, {})

  return (
    <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900">Students</h2>
      <p className="mt-1 mb-4 text-sm text-slate-500">
        Upload an Excel file with columns{' '}
        <code className="rounded bg-slate-100 px-1 text-xs text-slate-700">
          regn_no
        </code>
        ,{' '}
        <code className="rounded bg-slate-100 px-1 text-xs text-slate-700">
          course_code
        </code>
        ,{' '}
        <code className="rounded bg-slate-100 px-1 text-xs text-slate-700">
          department
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
            href="/student_registration_table.xlsx"
            download
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Sample Excel (214 rows)
          </a>
          <button
            type="button"
            onClick={downloadStudentsTemplate}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Download blank template
          </button>
          {students.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Clear roster
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {students.length > 0 && (
        <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-white">
              {students.length} students
            </span>
            {Object.entries(byCourse).map(([code, count]) => {
              const color = courseColor(code)
              return (
                <span
                  key={code}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${color.legend}`}
                >
                  <span className={`h-2 w-2 rounded-full ${color.dot}`} />
                  {code}: {count}
                </span>
              )
            })}
          </div>
          <div className="max-h-40 overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">regn_no</th>
                  <th className="px-3 py-2 font-medium">course_code</th>
                  <th className="px-3 py-2 font-medium">department</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {students.slice(0, 50).map((s) => (
                  <tr key={s.regn_no}>
                    <td className="px-3 py-1.5 font-mono text-slate-800">
                      {s.regn_no}
                    </td>
                    <td className="px-3 py-1.5 text-slate-700">{s.course_code}</td>
                    <td className="px-3 py-1.5 text-slate-700">{s.department}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {students.length > 50 && (
              <p className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
                Showing first 50 of {students.length} rows.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
