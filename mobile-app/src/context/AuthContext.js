import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as SplashScreen from "expo-splash-screen";
import { registerUnauthorizedHandler } from "../api/client";
import {
  login as apiLogin,
  logout as apiLogout,
  restoreSession,
  handleMicrosoftCallback,
  changePassword as apiChangePassword,
  isAllowedMobileRole,
} from "../services/authService";

SplashScreen.preventAutoHideAsync().catch(() => {});

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  const clearAuth = useCallback(() => {
    setToken(null);
    setUser(null);
    setMustChangePassword(false);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    clearAuth();
    setSessionExpired(false);
  }, [clearAuth]);

  useEffect(() => {
    registerUnauthorizedHandler(async () => {
      await apiLogout();
      clearAuth();
      setSessionExpired(true);
    });
  }, [clearAuth]);

  useEffect(() => {
    (async () => {
      try {
        const session = await restoreSession();
        if (session) {
          setToken(session.token);
          setUser(session.user);
          setMustChangePassword(!!session.mustChangePassword);
        }
      } catch {
        clearAuth();
      } finally {
        setLoading(false);
        SplashScreen.hideAsync().catch(() => {});
      }
    })();
  }, [clearAuth]);

  const login = useCallback(async (email, password) => {
    setSessionExpired(false);
    const data = await apiLogin(email, password);

    if (!isAllowedMobileRole(data.user?.role)) {
      await apiLogout();
      throw new Error("Hallora Mobile is for faculty attendance only.");
    }

    setToken(data.token);
    setUser(data.user);
    setMustChangePassword(!!data.mustChangePassword);
    return data;
  }, []);

  const loginWithMicrosoft = useCallback(async (msToken) => {
    setSessionExpired(false);
    const userData = await handleMicrosoftCallback(msToken);
    setToken(msToken);
    setUser(userData);
    setMustChangePassword(!!userData.mustChangePassword);
    return userData;
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const data = await apiChangePassword(currentPassword, newPassword);
    setMustChangePassword(false);
    if (user) {
      setUser({ ...user, mustChangePassword: false });
    }
    return data;
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      mustChangePassword,
      sessionExpired,
      login,
      loginWithMicrosoft,
      logout,
      changePassword,
      clearSessionExpired: () => setSessionExpired(false),
    }),
    [
      user,
      token,
      loading,
      mustChangePassword,
      sessionExpired,
      login,
      loginWithMicrosoft,
      logout,
      changePassword,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
