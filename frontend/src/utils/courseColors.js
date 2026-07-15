/**
 * Stable course_code → Tailwind class palette.
 * Full class strings are listed here so Tailwind's scanner keeps them.
 */

const PALETTE = [
  {
    seat: 'bg-blue-100 border-blue-400 text-blue-800',
    badge: 'bg-blue-600 text-white',
    legend: 'bg-blue-100 border-blue-300 text-blue-800',
    dot: 'bg-blue-600',
  },
  {
    seat: 'bg-purple-100 border-purple-400 text-purple-800',
    badge: 'bg-purple-600 text-white',
    legend: 'bg-purple-100 border-purple-300 text-purple-800',
    dot: 'bg-purple-600',
  },
  {
    seat: 'bg-amber-100 border-amber-400 text-amber-800',
    badge: 'bg-amber-600 text-white',
    legend: 'bg-amber-100 border-amber-300 text-amber-800',
    dot: 'bg-amber-600',
  },
  {
    seat: 'bg-emerald-100 border-emerald-400 text-emerald-800',
    badge: 'bg-emerald-600 text-white',
    legend: 'bg-emerald-100 border-emerald-300 text-emerald-800',
    dot: 'bg-emerald-600',
  },
  {
    seat: 'bg-pink-100 border-pink-400 text-pink-800',
    badge: 'bg-pink-600 text-white',
    legend: 'bg-pink-100 border-pink-300 text-pink-800',
    dot: 'bg-pink-600',
  },
  {
    seat: 'bg-cyan-100 border-cyan-400 text-cyan-800',
    badge: 'bg-cyan-600 text-white',
    legend: 'bg-cyan-100 border-cyan-300 text-cyan-800',
    dot: 'bg-cyan-600',
  },
]

function hashCourse(code) {
  let h = 0
  const s = String(code || '')
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0
  }
  return h
}

export function courseColor(courseCode) {
  return PALETTE[hashCourse(courseCode) % PALETTE.length]
}

export function collectCoursesFromResult(result) {
  const set = new Set()
  for (const venue of result?.venues_used || []) {
    for (const row of venue.seating_arrangement || []) {
      for (const cell of row) {
        if (cell === 'Empty' || !Array.isArray(cell)) continue
        for (const slot of cell) {
          if (slot?.course) set.add(slot.course)
        }
      }
    }
  }
  return [...set].sort()
}
