import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "../api/client";
import { assertObject } from "../api/errors";
import { STORAGE_KEYS } from "../constants";

async function readQueue() {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue) {
  await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
}

export async function enqueueOfflineRequest(item) {
  const queue = await readQueue();
  queue.push({
    id: item.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: item.type,
    payload: item.payload,
    createdAt: Date.now(),
    attempts: 0,
  });
  await writeQueue(queue);
  return queue.length;
}

export async function processOfflineQueue(handlers = {}) {
  const queue = await readQueue();
  if (!queue.length) return { processed: 0, failed: 0, remaining: 0 };

  const remaining = [];
  let processed = 0;
  let failed = 0;

  for (const item of queue) {
    const handler = handlers[item.type];
    if (!handler) {
      remaining.push(item);
      continue;
    }
    try {
      await handler(item.payload);
      processed += 1;
    } catch {
      item.attempts = (item.attempts || 0) + 1;
      if (item.attempts < 5) {
        remaining.push(item);
      }
      failed += 1;
    }
  }

  await writeQueue(remaining);
  return { processed, failed, remaining: remaining.length };
}

export async function getOfflineQueueLength() {
  const queue = await readQueue();
  return queue.length;
}

export async function submitAttendanceQueued(payload) {
  return enqueueOfflineRequest({ type: "attendance_submit", payload });
}

export async function submitAttendanceDirect(payload) {
  const { data } = await apiRequest({
    method: "post",
    url: "/api/attendance/submit",
    data: payload,
    skipDedupe: true,
  });
  assertObject(data, "attendance submit");
  return data;
}
