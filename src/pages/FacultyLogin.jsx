import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AcademicCapIcon,
  BuildingOffice2Icon,
  EnvelopeIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import api, { logout } from "../lib/api";

const DOME_BG = "https://admissions.kct.ac.in/images/dome-new.png";

function MicrosoftIcon({ className = "h-5 w-5" }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path fill="#F25022" d="M11 2.25H2.25V11H11V2.25Z" />
      <path fill="#7FBA00" d="M21.75 2.25H13V11H21.75V2.25Z" />
      <path fill="#00A4EF" d="M11 13H2.25V21.75H11V13Z" />
      <path fill="#FFB900" d="M21.75 13H13V21.75H21.75V13Z" />
    </svg>
  );
}

function FacultyLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [flashMessage, setFlashMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setFlashMessage("");
    setInfoMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!data.success) {
        setError(data.message || "Login failed");
        return;
      }

      const allowedRoles = ["faculty"];
      if (!allowedRoles.includes(data.user?.role)) {
        await logout("/attendance/login");
        setError("This login is for faculty attendance only. Use the main portal for admin access.");
        return;
      }

      sessionStorage.setItem("user", JSON.stringify(data.user));

      if (data.mustChangePassword) {
        navigate("/change-password", { replace: true });
        return;
      }

      if (data.user.role === "faculty") {
        navigate("/faculty/dashboard", { replace: true });
      }
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    setError("");
    setInfoMessage("");
    setFlashMessage("Redirecting to Microsoft...");
    try {
      const { data } = await api.get("/auth/microsoft/login");
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        setFlashMessage("");
        setError(data.message || "Could not initiate Microsoft login.");
      }
    } catch {
      setFlashMessage("");
      setError("Error connecting to authentication service.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 font-[Inter,system-ui,sans-serif]">
      {/* Header */}
      <header className="relative z-10 bg-white/95 backdrop-blur border-b border-slate-200/80">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0B1F4B] text-white">
              <BuildingOffice2Icon className="h-5 w-5" />
            </div>
            <div className="flex sm:hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0B1F4B] text-white">
              <AcademicCapIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[#0B1F4B] text-sm sm:text-base truncate">
                Faculty Attendance Portal
              </p>
              <p className="hidden sm:block text-xs text-slate-500">
                ClassAssign Exam Seating System
              </p>
            </div>
          </div>

          <div className="hidden md:block text-right max-w-md shrink">
            <p className="text-[11px] font-semibold text-slate-800 leading-snug tracking-wide">
              KUMARAGURU COLLEGE OF TECHNOLOGY (AUTONOMOUS)
            </p>
            <p className="text-[10px] italic text-slate-600 leading-snug mt-0.5">
              Accredited by NAAC with &apos;A++&apos; Grade
              <br />
              Approved by AICTE · Affiliated to Anna University, Chennai
            </p>
          </div>
        </div>
      </header>

      {/* Body */}
      <main
        className="relative flex-1 flex items-center justify-center px-4 py-8 sm:py-12"
        style={{
          backgroundImage: `linear-gradient(rgba(248,250,252,0.55), rgba(248,250,252,0.72)), url('${DOME_BG}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="w-full max-w-[400px]">
          <div className="bg-white rounded-2xl shadow-[0_12px_40px_rgba(15,23,42,0.12)] border border-slate-100 px-6 sm:px-8 py-7 sm:py-8">
            <h1 className="text-2xl font-bold text-[#0B1F4B]">
              <span className="sm:hidden">Faculty Login</span>
              <span className="hidden sm:inline">Login</span>
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Sign in to mark exam attendance.
            </p>

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-xl text-sm">
                {error}
              </div>
            )}
            {flashMessage && (
              <div className="mt-4 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3.5 py-2.5 rounded-xl text-sm font-medium">
                {flashMessage}
              </div>
            )}
            {infoMessage && (
              <div className="mt-4 bg-blue-50 border border-blue-200 text-blue-800 px-3.5 py-2.5 rounded-xl text-sm">
                {infoMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="faculty-email" className="block text-xs font-semibold text-slate-600 mb-1.5 sm:hidden">
                  KCT Email
                </label>
                <div className="relative">
                  <EnvelopeIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    id="faculty-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="faculty@kct.ac.in"
                    autoComplete="username"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B1F4B]/25 focus:border-[#0B1F4B] focus:bg-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="faculty-password" className="block text-xs font-semibold text-slate-600 mb-1.5 sm:hidden">
                  Password
                </label>
                <div className="relative">
                  <LockClosedIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    id="faculty-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B1F4B]/25 focus:border-[#0B1F4B] focus:bg-white"
                    required
                  />
                </div>
                <div className="mt-2 flex justify-end sm:hidden">
                  <button
                    type="button"
                    onClick={() =>
                      setInfoMessage("Contact your Faculty Incharge to reset your password.")
                    }
                    className="text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-[#0B1F4B] hover:bg-[#122a5c] disabled:opacity-60 text-white py-3 text-sm font-semibold shadow-sm transition-colors"
              >
                {loading ? "Signing in…" : (
                  <>
                    <span className="sm:hidden">Login</span>
                    <span className="hidden sm:inline">Login →</span>
                  </>
                )}
              </button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-semibold tracking-wide text-slate-400">OR</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <button
              type="button"
              onClick={handleMicrosoftLogin}
              disabled={loading || !!flashMessage}
              className="w-full flex items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-800 py-3 text-sm font-semibold shadow-sm transition-colors"
            >
              <MicrosoftIcon />
              Login with Microsoft
            </button>

            <p className="mt-5 text-center text-xs text-slate-500 hidden sm:block">
              Only authorized KCT users can login.
            </p>

            <p className="mt-4 sm:mt-5 text-center text-sm text-slate-500">
              Admin login?{" "}
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              >
                Main portal
              </button>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default FacultyLogin;
