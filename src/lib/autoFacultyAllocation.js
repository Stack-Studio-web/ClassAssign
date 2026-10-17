/**
 * Auto faculty allocation: intelligent assignment, validation, and repair.
 * Mirrors backend same-day rule in facultyTimeConflict.js:
 * one active invigilation allotment per faculty per calendar day.
 */

export function normalizeExamTime(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const hours = String(value.getHours()).padStart(2, "0");
    const minutes = String(value.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
  const match = String(value).trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function normalizeExamDateOnly(value) {
  if (!value) return null;
  const str = String(value).trim();
  return str.includes("T") ? str.split("T")[0] : str.slice(0, 10);
}

/** YYYY-MM-DD → DD/MM/YYYY */
export function formatDateDisplay(dateOnly) {
  const m = String(dateOnly || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(dateOnly || "");
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Kept for venue occupancy helpers; faculty conflict uses same calendar day. */
export function examTimesOverlap(existingStart, existingEnd, newStart, newEnd) {
  const es = normalizeExamTime(existingStart);
  const ee = normalizeExamTime(existingEnd);
  const ns = normalizeExamTime(newStart);
  const ne = normalizeExamTime(newEnd);
  if (!es || !ee || !ns || !ne) return false;
  return es < ne && ee > ns;
}

function formatTime12h(value) {
  const norm = normalizeExamTime(value);
  if (!norm) return String(value || "").trim();
  const [hStr, mStr] = norm.split(":");
  let hour = Number(hStr);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${mStr} ${ampm}`;
}

export function laterTime(a, b) {
  const left = normalizeExamTime(a);
  const right = normalizeExamTime(b);
  if (!left) return right;
  if (!right) return left;
  return left >= right ? left : right;
}

export function occupancyEndForGroup(examStartTime, examEndTime, groupMaxByStart) {
  const start = normalizeExamTime(examStartTime);
  const ownEnd = normalizeExamTime(examEndTime);
  const groupEnd = start && groupMaxByStart ? groupMaxByStart[start] : null;
  return laterTime(ownEnd, groupEnd) || ownEnd;
}

export function buildStartTimeGroupMaxMap(examWindows = []) {
  const map = {};
  for (const window of examWindows) {
    const start = normalizeExamTime(window.startTime ?? window.examStartTime);
    const end = normalizeExamTime(window.endTime ?? window.examEndTime);
    if (!start || !end) continue;
    map[start] = laterTime(map[start], end);
  }
  return map;
}

function occupancyEndFromContext(examContext) {
  return (
    normalizeExamTime(examContext?.occupancyEndTime) ||
    occupancyEndForGroup(
      examContext?.examStartTime,
      examContext?.examEndTime,
      examContext?.groupMaxByStart
    ) ||
    normalizeExamTime(examContext?.examEndTime)
  );
}

export function formatExamTimeRange(examContext) {
  const start = formatTime12h(examContext?.examStartTime);
  const occupancyEnd = occupancyEndFromContext(examContext);
  const end = formatTime12h(occupancyEnd || examContext?.examEndTime);
  return `${start}–${end}`;
}

export function buildSameDayConflictMessage({
  facultyName,
  venueName,
  examDate,
  examStartTime,
  examEndTime,
}) {
  const name = facultyName || "This faculty";
  const venue = venueName || "another venue";
  const date = formatDateDisplay(normalizeExamDateOnly(examDate));
  const start = formatTime12h(examStartTime);
  const end = formatTime12h(examEndTime);
  const when =
    start && end
      ? ` at ${venue} (${start}–${end})`
      : venue
        ? ` at ${venue}`
        : "";
  const datePart = date ? ` on ${date}` : "";
  return `${name} is already assigned to an exam${datePart}${when}. Please select another faculty member.`;
}

/** Same calendar day = conflict (times ignored). */
function hasInMemoryExamConflict(busySlots, examContext) {
  const dateOnly = normalizeExamDateOnly(examContext.examDate);
  if (!dateOnly) return false;
  return (busySlots || []).some((slot) => slot.date === dateOnly);
}

export function createAllocationRuntime(facultyPool) {
  const eligible = (facultyPool || []).filter(
    (f) => f.isAvailable !== false && Number(f.remaining ?? 0) > 0
  );
  const busySlotsByFaculty = new Map();

  // Seed from existing saved allotments reported by the availability API.
  for (const f of facultyPool || []) {
    const uuid = String(f.uuid);
    const info = f.conflictInfo;
    if (!info && !f.hasTimeConflict) continue;
    const date =
      normalizeExamDateOnly(info?.examDate) ||
      normalizeExamDateOnly(info?.exam_date) ||
      null;
    if (!busySlotsByFaculty.has(uuid)) busySlotsByFaculty.set(uuid, []);
    busySlotsByFaculty.get(uuid).push({
      date,
      start: info?.examStartTime ?? info?.exam_start_time ?? null,
      end: info?.examEndTime ?? info?.exam_end_time ?? null,
      venueName: info?.venueName ?? info?.venue_name ?? null,
      venueUuid: null,
    });
  }

  return {
    availableFaculty: eligible,
    remainingSlots: new Map(
      eligible.map((f) => [
        String(f.uuid),
        Math.max(0, Number(f.remaining ?? 0)),
      ])
    ),
    busySlotsByFaculty,
    assignedInBatchByFaculty: new Map(),
  };
}

export function isFacultyEligibleForAutoAllocation(faculty, runtime, examContext) {
  const uuid = String(faculty.uuid);
  if ((runtime.remainingSlots.get(uuid) ?? 0) <= 0) return false;
  if (faculty.isAvailable === false) return false;
  if (faculty.hasTimeConflict) return false;
  if (runtime.assignedInBatchByFaculty.has(uuid)) return false;
  const busy = runtime.busySlotsByFaculty.get(uuid) || [];
  return !hasInMemoryExamConflict(busy, examContext);
}

export function recordAutoFacultyAssignment(runtime, faculty, item, examContext) {
  const uuid = String(faculty.uuid);
  runtime.remainingSlots.set(uuid, (runtime.remainingSlots.get(uuid) ?? 0) - 1);
  runtime.assignedInBatchByFaculty.set(uuid, item.venue.uuid);
  if (!runtime.busySlotsByFaculty.has(uuid)) runtime.busySlotsByFaculty.set(uuid, []);
  runtime.busySlotsByFaculty.get(uuid).push({
    date: normalizeExamDateOnly(examContext.examDate),
    start: examContext.examStartTime,
    end: occupancyEndFromContext(examContext),
    venueName: item.venue.name,
    venueUuid: item.venue.uuid,
  });
}

export function itemHasStudents(item) {
  const seats = item.seats;
  if (!Array.isArray(seats)) return true;
  return seats.some((row) =>
    Array.isArray(row) &&
    row.some(
      (cell) =>
        cell &&
        cell !== "Empty" &&
        (Array.isArray(cell)
          ? cell.some((s) => s !== null && s !== undefined)
          : true)
    )
  );
}

/**
 * Intelligently assign faculty to each venue using capacity + same-day rules.
 */
export function runAutoFacultyAllocation(venueItems, facultyPool, examContext) {
  const runtime = createAllocationRuntime(facultyPool);

  return (venueItems || []).map((item) => {
    if (!itemHasStudents(item)) {
      return {
        ...item,
        facultyId: null,
        previewFacultyName: "Not Assigned",
        needsFaculty: false,
      };
    }

    const faculty = runtime.availableFaculty.find((f) =>
      isFacultyEligibleForAutoAllocation(f, runtime, examContext)
    );

    if (!faculty) {
      return {
        ...item,
        facultyId: null,
        previewFacultyName: "Not Assigned",
        needsFaculty: true,
        unfilledReason: `No eligible faculty remain for ${item.venue?.name || "this venue"} on ${formatDateDisplay(normalizeExamDateOnly(examContext.examDate))} (same-day invigilation already assigned or capacity exhausted).`,
      };
    }

    recordAutoFacultyAssignment(runtime, faculty, item, examContext);
    return {
      ...item,
      facultyId: faculty.uuid,
      previewFacultyName: `${faculty.name} (${faculty.department})`,
      needsFaculty: false,
      unfilledReason: null,
    };
  });
}

/**
 * Full pre-submit validation of a generated AUTO plan.
 */
export function validateAutoFacultyPlan(venueItems, facultyPool, examContext) {
  const conflicts = [];
  const unassigned = [];
  const facultyUsage = new Map();
  const inPlanSchedules = new Map();
  const seenConflictKeys = new Set();
  const dateOnly = normalizeExamDateOnly(examContext.examDate);
  const dateDisplay = formatDateDisplay(dateOnly);

  const addConflict = (conflict) => {
    const key = `${conflict.type}:${conflict.message}`;
    if (seenConflictKeys.has(key)) return;
    seenConflictKeys.add(key);
    conflicts.push(conflict);
  };

  for (const item of venueItems || []) {
    if (!itemHasStudents(item)) continue;

    const venueName = item.venue?.name || "Unknown";
    const venueUuid = item.venue?.uuid;

    if (!item.facultyId) {
      unassigned.push({
        venueUuid,
        venueName,
        message:
          item.unfilledReason ||
          `${venueName} has no eligible faculty on ${dateDisplay}. All available faculty are already allotted that day or at capacity.`,
      });
      continue;
    }

    const faculty = (facultyPool || []).find(
      (f) => String(f.uuid) === String(item.facultyId)
    );
    if (!faculty) {
      addConflict({
        type: "unknown",
        venueName,
        message: `Unknown faculty assigned to ${venueName}.`,
      });
      continue;
    }

    if (faculty.isAvailable === false) {
      addConflict({
        type: "unavailable",
        venueName,
        facultyName: faculty.name,
        message: `${faculty.name} is marked unavailable.`,
      });
    }

    if (faculty.hasTimeConflict) {
      addConflict({
        type: "db_conflict",
        venueName,
        facultyName: faculty.name,
        message:
          faculty.conflictMessage ||
          buildSameDayConflictMessage({
            facultyName: faculty.name,
            venueName: faculty.conflictInfo?.venueName,
            examDate: faculty.conflictInfo?.examDate || examContext.examDate,
            examStartTime: faculty.conflictInfo?.examStartTime,
            examEndTime: faculty.conflictInfo?.examEndTime,
          }),
      });
    }

    const uuid = String(faculty.uuid);
    const uses = (facultyUsage.get(uuid) || 0) + 1;
    facultyUsage.set(uuid, uses);
    if (uses > Number(faculty.remaining ?? 0)) {
      addConflict({
        type: "capacity",
        venueName,
        facultyName: faculty.name,
        message: `${faculty.name} exceeds allocation capacity (${uses} assigned, ${faculty.remaining ?? 0} remaining).`,
      });
    }

    const schedule = inPlanSchedules.get(uuid) || [];
    for (const slot of schedule) {
      if (slot.venueUuid !== venueUuid) {
        addConflict({
          type: "duplicate_faculty",
          facultyName: faculty.name,
          venues: [slot.venueName, venueName],
          message: `${faculty.name} cannot be assigned to both ${slot.venueName} and ${venueName} on the same seating plan.`,
        });
      }
      if (slot.date === dateOnly) {
        addConflict({
          type: "same_day",
          facultyName: faculty.name,
          venues: [slot.venueName, venueName],
          message: buildSameDayConflictMessage({
            facultyName: faculty.name,
            venueName: slot.venueName,
            examDate: examContext.examDate,
            examStartTime: slot.start,
            examEndTime: slot.end,
          }),
        });
      }
    }

    schedule.push({
      venueUuid,
      venueName,
      date: dateOnly,
      start: examContext.examStartTime,
      end: occupancyEndFromContext(examContext),
    });
    inPlanSchedules.set(uuid, schedule);
  }

  const canSubmit = conflicts.length === 0 && unassigned.length === 0;

  return {
    valid: canSubmit,
    canSubmit,
    conflicts,
    unassigned,
    summaryMessages: [
      ...conflicts.map((c) => c.message),
      ...unassigned.map((u) => u.message),
    ],
  };
}

/**
 * Attempt to repair conflicting assignments by keeping first venue per faculty
 * and reassigning later conflicting venues.
 */
export function repairAutoFacultyPlan(venueItems, facultyPool, examContext) {
  let items = (venueItems || []).map((i) => ({ ...i }));

  const facultyVenueOrder = new Map();
  items.forEach((item, idx) => {
    if (!item.facultyId || !itemHasStudents(item)) return;
    const uuid = String(item.facultyId);
    if (!facultyVenueOrder.has(uuid)) facultyVenueOrder.set(uuid, []);
    facultyVenueOrder.get(uuid).push({
      idx,
      venueUuid: item.venue.uuid,
      venueName: item.venue.name,
    });
  });

  const indicesToClear = new Set();
  for (const [, venues] of facultyVenueOrder) {
    if (venues.length <= 1) continue;
    for (let i = 1; i < venues.length; i += 1) {
      indicesToClear.add(venues[i].idx);
    }
  }

  indicesToClear.forEach((idx) => {
    items[idx] = {
      ...items[idx],
      facultyId: null,
      previewFacultyName: "Not Assigned",
      needsFaculty: true,
    };
  });

  const runtime = createAllocationRuntime(facultyPool);

  for (const item of items) {
    if (!item.facultyId || !itemHasStudents(item)) continue;
    const faculty = facultyPool.find(
      (f) => String(f.uuid) === String(item.facultyId)
    );
    if (faculty && isFacultyEligibleForAutoAllocation(faculty, runtime, examContext)) {
      recordAutoFacultyAssignment(runtime, faculty, item, examContext);
    } else {
      item.facultyId = null;
      item.previewFacultyName = "Not Assigned";
      item.needsFaculty = true;
    }
  }

  for (const item of items) {
    if (item.facultyId || !itemHasStudents(item)) continue;
    const faculty = runtime.availableFaculty.find((f) =>
      isFacultyEligibleForAutoAllocation(f, runtime, examContext)
    );
    if (faculty) {
      recordAutoFacultyAssignment(runtime, faculty, item, examContext);
      item.facultyId = faculty.uuid;
      item.previewFacultyName = `${faculty.name} (${faculty.department})`;
      item.needsFaculty = false;
      item.unfilledReason = null;
    } else {
      item.previewFacultyName = "Not Assigned";
      item.needsFaculty = true;
      item.unfilledReason = `No eligible faculty remain for ${item.venue?.name || "this venue"} on ${formatDateDisplay(normalizeExamDateOnly(examContext.examDate))} (same-day invigilation already assigned or capacity exhausted).`;
    }
  }

  return items;
}

/**
 * Generate → validate → repair → revalidate.
 */
export function validateAndRepairAutoFacultyPlan(venueItems, facultyPool, examContext) {
  let items = (venueItems || []).map((i) => ({ ...i }));
  let validation = validateAutoFacultyPlan(items, facultyPool, examContext);

  if (!validation.valid) {
    items = repairAutoFacultyPlan(items, facultyPool, examContext);
    validation = validateAutoFacultyPlan(items, facultyPool, examContext);
  }

  return { items, validation };
}
