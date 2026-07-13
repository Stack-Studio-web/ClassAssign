import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import NetInfo from "@react-native-community/netinfo";
import {
  getOfflineQueueLength,
  processOfflineQueue,
  submitAttendanceDirect,
} from "../services/offlineQueueService";

const NetworkContext = createContext(null);

export function NetworkProvider({ children }) {
  const [isConnected, setIsConnected] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState(true);
  const [queueLength, setQueueLength] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshQueueLength = useCallback(async () => {
    setQueueLength(await getOfflineQueueLength());
  }, []);

  const syncQueue = useCallback(async () => {
    setSyncing(true);
    try {
      await processOfflineQueue({
        attendance_submit: submitAttendanceDirect,
      });
      await refreshQueueLength();
    } finally {
      setSyncing(false);
    }
  }, [refreshQueueLength]);

  useEffect(() => {
    refreshQueueLength();
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected !== false;
      const reachable = state.isInternetReachable !== false;
      setIsConnected(connected);
      setIsInternetReachable(reachable);
      if (connected && reachable) {
        syncQueue();
      }
    });
    return () => unsubscribe();
  }, [refreshQueueLength, syncQueue]);

  const isOnline = isConnected && isInternetReachable !== false;

  const value = useMemo(
    () => ({
      isOnline,
      isConnected,
      queueLength,
      syncing,
      refreshQueueLength,
      syncQueue,
    }),
    [isOnline, isConnected, queueLength, syncing, refreshQueueLength, syncQueue]
  );

  return (
    <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
  );
}

export function useNetwork() {
  const ctx = useContext(NetworkContext);
  if (!ctx) {
    throw new Error("useNetwork must be used inside NetworkProvider");
  }
  return ctx;
}
