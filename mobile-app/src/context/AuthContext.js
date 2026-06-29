// src/context/AuthContext.js
// ─────────────────────────────────────────────────────────────
// Global auth state available to every screen via useAuth().
// ─────────────────────────────────────────────────────────────

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  login as apiLogin,
  logout as apiLogout,
  restoreSession,
  handleMicrosoftCallback,
} from "../services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true); // true while restoring session

  /* ── Restore session on app launch ── */
  useEffect(() => {
    (async () => {
      try {
        const session = await restoreSession();
        if (session) {
          setToken(session.token);
          setUser(session.user);
        }
      } catch {
        // Expired / invalid session — start fresh
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ── Manual email/password login ── */
  const login = async (email, password) => {
    const data = await apiLogin(email, password);
    setToken(data.token);
    setUser(data.user);
    return data; // caller can read redirectTo
  };

  /* ── Microsoft SSO callback ── */
  const loginWithMicrosoft = async (msToken) => {
    const userData = await handleMicrosoftCallback(msToken);
    setToken(msToken);
    setUser(userData);
  };

  /* ── Logout ── */
  const logout = async () => {
    await apiLogout(token);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, loginWithMicrosoft, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}