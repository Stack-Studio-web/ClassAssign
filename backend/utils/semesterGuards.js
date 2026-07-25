const db = require("../config/db");
const Api = require("./apiResponse");

const COMPLETED_MESSAGE =
  "This semester has been completed. No further modifications are allowed.";

async function isSemesterCompletedByBatchInternalId(batchInternalId) {
  if (!batchInternalId) return false;
  const [rows] = await db.query(
    `SELECT s.is_archived
     FROM batches b
     JOIN semesters s ON s.id = b.semester_id
     WHERE b.id = ?
     LIMIT 1`,
    [batchInternalId]
  );
  return Boolean(rows[0]?.is_archived ?? rows[0]?.isarchived);
}

async function isSemesterCompletedBySemesterInternalId(semesterInternalId) {
  if (!semesterInternalId) return false;
  const [rows] = await db.query(
    `SELECT is_archived FROM semesters WHERE id = ? LIMIT 1`,
    [semesterInternalId]
  );
  return Boolean(rows[0]?.is_archived ?? rows[0]?.isarchived);
}

async function isSemesterCompletedByStudentInternalId(studentInternalId) {
  if (!studentInternalId) return false;
  const [rows] = await db.query(
    `SELECT s.is_archived
     FROM students st
     JOIN batches b ON b.id = st.batch_id
     JOIN semesters s ON s.id = b.semester_id
     WHERE st.id = ?
     LIMIT 1`,
    [studentInternalId]
  );
  return Boolean(rows[0]?.is_archived ?? rows[0]?.isarchived);
}

function semesterCompletedResponse(res) {
  return Api.conflict(res, "SEMESTER_COMPLETED", COMPLETED_MESSAGE);
}

async function assertSemesterMutableByBatchInternalId(batchInternalId, res) {
  if (!batchInternalId) {
    Api.notFound(res, "Batch not found");
    return false;
  }
  const completed = await isSemesterCompletedByBatchInternalId(batchInternalId);
  if (completed) {
    semesterCompletedResponse(res);
    return false;
  }
  return true;
}

async function assertSemesterMutableBySemesterInternalId(semesterInternalId, res) {
  if (!semesterInternalId) {
    Api.notFound(res, "Semester not found");
    return false;
  }
  const completed = await isSemesterCompletedBySemesterInternalId(semesterInternalId);
  if (completed) {
    semesterCompletedResponse(res);
    return false;
  }
  return true;
}

async function assertSemesterMutableByStudentInternalId(studentInternalId, res) {
  if (!studentInternalId) {
    Api.notFound(res, "Student not found");
    return false;
  }
  const completed = await isSemesterCompletedByStudentInternalId(studentInternalId);
  if (completed) {
    semesterCompletedResponse(res);
    return false;
  }
  return true;
}

module.exports = {
  COMPLETED_MESSAGE,
  isSemesterCompletedByBatchInternalId,
  isSemesterCompletedBySemesterInternalId,
  isSemesterCompletedByStudentInternalId,
  assertSemesterMutableByBatchInternalId,
  assertSemesterMutableBySemesterInternalId,
  assertSemesterMutableByStudentInternalId,
};
