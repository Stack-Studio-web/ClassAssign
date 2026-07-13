import { useEffect } from "react";

export function useAbortableEffect(effect, deps) {
  useEffect(() => {
    const controller = new AbortController();
    const cleanup = effect(controller.signal);
    return () => {
      controller.abort();
      if (typeof cleanup === "function") {
        cleanup();
      }
    };
  }, deps);
}

export function useDebouncedCallback(callback, delay) {
  const timerRef = { current: null };
  const callbackRef = { current: callback };
  callbackRef.current = callback;

  return (...args) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => callbackRef.current(...args), delay);
  };
}

export function useMountedRef() {
  const mounted = { current: true };
  useEffect(() => () => {
    mounted.current = false;
  }, []);
  return mounted;
}
