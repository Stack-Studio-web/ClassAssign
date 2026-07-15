import * as XLSX from 'xlsx'

/** Map common header aliases → canonical field. */
const HEADER_MAP = {
  regn_no: 'regn_no',
  regnno: 'regn_no',
  reg_no: 'regn_no',
  regno: 'regn_no',
  roll_no: 'regn_no',
  rollno: 'regn_no',
  roll: 'regn_no',
  register_no: 'regn_no',
  registration_no: 'regn_no',
  course_code: 'course_code',
  coursecode: 'course_code',
  course: 'course_code',
  subject_code: 'course_code',
  subject: 'course_code',
  department: 'department',
  dept: 'department',
  dept_code: 'department',
  branch: 'department',
}

function normalizeHeader(h) {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

/**
 * Parse .xlsx / .xls / .csv ArrayBuffer into student objects.
 * @returns {{ students: Array<{regn_no:string,course_code:string,department:string}>, error?: string }}
 */
export function parseStudentsWorkbook(buffer) {
  let workbook
  try {
    workbook = XLSX.read(buffer, { type: 'array' })
  } catch {
    return { students: [], error: 'Could not read the file. Use .xlsx, .xls, or .csv.' }
  }

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { students: [], error: 'Workbook has no sheets.' }
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: '',
    raw: false,
  })
  if (rows.length === 0) {
    return { students: [], error: 'Sheet is empty. Add a header row and student data.' }
  }

  const sample = rows[0]
  const fieldByCol = {}
  for (const key of Object.keys(sample)) {
    const canon = HEADER_MAP[normalizeHeader(key)]
    if (canon) fieldByCol[key] = canon
  }

  const mapped = new Set(Object.values(fieldByCol))
  for (const need of ['regn_no', 'course_code', 'department']) {
    if (!mapped.has(need)) {
      return {
        students: [],
        error:
          'Missing required column. Expected headers: regn_no, course_code, department ' +
          '(aliases: roll_no, course, dept also work).',
      }
    }
  }

  const students = []
  const seen = new Set()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const stu = { regn_no: '', course_code: '', department: '' }
    for (const [col, field] of Object.entries(fieldByCol)) {
      stu[field] = String(row[col] ?? '').trim()
    }
    if (!stu.regn_no && !stu.course_code && !stu.department) continue
    if (!stu.regn_no || !stu.course_code || !stu.department) {
      return {
        students: [],
        error: `Row ${i + 2}: each row needs regn_no, course_code, and department.`,
      }
    }
    if (seen.has(stu.regn_no)) {
      return {
        students: [],
        error: `Duplicate regn_no "${stu.regn_no}" at row ${i + 2}.`,
      }
    }
    seen.add(stu.regn_no)
    students.push(stu)
  }

  if (students.length === 0) {
    return { students: [], error: 'No student rows found under the header.' }
  }

  return { students }
}

/** Download template matching student_registration_table.xlsx columns. */
export function downloadStudentsTemplate() {
  const rows = [
    { regn_no: '23BCS001', course_code: 'U18CST001', department: 'CSE' },
    { regn_no: '23BCS002', course_code: 'U18CST001', department: 'CSE' },
    { regn_no: '23BCS003', course_code: 'U18CST001', department: 'CSE' },
  ]
  const sheet = XLSX.utils.json_to_sheet(rows)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Students')
  XLSX.writeFile(book, 'student_registration_table.xlsx')
}
