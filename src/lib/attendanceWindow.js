export function formatCountdown(totalSeconds) {
  if (totalSeconds == null || totalSeconds <= 0) return "0m";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function getWindowBadge(status) {
  switch (status) {
    case "OPEN":
      return { label: "Open", className: "bg-green-100 text-green-800 border-green-200" };
    case "PENDING":
      return { label: "Pending", className: "bg-gray-100 text-gray-700 border-gray-200" };
    case "LOCKED":
      return { label: "Closed", className: "bg-red-100 text-red-800 border-red-200" };
    case "MANUALLY_UNLOCKED":
      return { label: "Manual Unlock", className: "bg-blue-100 text-blue-800 border-blue-200" };
    case "MANUALLY_LOCKED":
      return { label: "Locked", className: "bg-red-100 text-red-800 border-red-200" };
    default:
      return { label: status || "Unknown", className: "bg-gray-100 text-gray-700 border-gray-200" };
  }
}

export function computeRemainingSeconds(window, tick = Date.now()) {
  if (!window?.closesAt || window.status !== "OPEN") {
    return window?.remainingSeconds ?? null;
  }
  const close = new Date(window.closesAt).getTime();
  return Math.max(0, Math.floor((close - tick) / 1000));
}

export function computeOpensInSeconds(window, tick = Date.now()) {
  if (!window?.opensAt || window.status !== "PENDING") return null;
  const open = new Date(window.opensAt).getTime();
  return Math.max(0, Math.floor((open - tick) / 1000));
}
