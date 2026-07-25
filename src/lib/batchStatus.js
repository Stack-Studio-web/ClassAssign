/** @returns {boolean} */
export function isBatchCompleted(batch) {
  return batch?.status === "COMPLETED";
}

/** @returns {boolean} */
export function isBatchActive(batch) {
  return batch?.status !== "COMPLETED";
}
