import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "../constants";

function draftKey(assignmentUuid) {
  return `${STORAGE_KEYS.ATTENDANCE_DRAFT_PREFIX}${assignmentUuid}`;
}

export async function saveAttendanceDraft(assignmentUuid, draft) {
  if (!assignmentUuid) return;
  await AsyncStorage.setItem(
    draftKey(assignmentUuid),
    JSON.stringify({ ...draft, savedAt: Date.now() })
  );
}

export async function loadAttendanceDraft(assignmentUuid) {
  if (!assignmentUuid) return null;
  const raw = await AsyncStorage.getItem(draftKey(assignmentUuid));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearAttendanceDraft(assignmentUuid) {
  if (!assignmentUuid) return;
  await AsyncStorage.removeItem(draftKey(assignmentUuid));
}
