/**
 * @typedef {Object} AcademicYear
 * @property {string} uuid
 * @property {string} label
 * @property {number|null} startYear
 * @property {number|null} endYear
 * @property {boolean} isArchived
 * @property {string} [createdAt]
 */

/**
 * @typedef {Object} Semester
 * @property {string} uuid
 * @property {string} semesterType
 * @property {string} label
 * @property {boolean} isArchived
 * @property {string} [createdAt]
 */

/**
 * @typedef {Object} SemesterStats
 * @property {number} batchCount
 * @property {number} studentCount
 * @property {number} draftBatchCount
 */

/**
 * @typedef {Object} ParsedAcademicError
 * @property {string} message
 * @property {string} code
 * @property {string} [semesterType]
 */

export {};
