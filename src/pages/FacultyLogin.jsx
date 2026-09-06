import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AcademicCapIcon,
  BuildingOffice2Icon,
} from "@heroicons/react/24/outline";
import api, { fetchCurrentUser } from "../lib/api";

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
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [flashMessage, setFlashMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const redirectFacultyUser = async (user) => {
    if (!user) {
      setFlashMessage("");
      setError("Login completed but session could not be loaded. Please try again.");
      return;
    }
    if (user.role !== "faculty") {
      setFlashMessage("");
      try {
        await api.post("/auth/logout");
      } catch {
        /* best effort */
      }
      sessionStorage.removeItem("user");
      setError("This portal is for faculty attendance only. Use the main portal for admin access.");
      return;
    }
    if (user.mustChangePassword) {
      navigate("/change-password", { replace: true });
      return;
    }
    navigate("/faculty/dashboard", { replace: true });
  };

  useEffect(() => {
    const ssoError = searchParams.get("error");
    if (ssoError) {
      setError(ssoError);
      return;
    }

    const ssoSuccess = searchParams.get("sso_success");
    if (!ssoSuccess) return;

    let cancelled = false;
    (async () => {
      setFlashMessage("Signing you in…");
      const user = await fetchCurrentUser();
      if (cancelled) return;
      await redirectFacultyUser(user);
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setFlashMessage("");
    setLoading(true);

    try {
      const { data } = await api.post("/auth/login", { email, password });

      if (!data.success) {
        setError(data.message || "Login failed. Please check your credentials.");
        return;
      }

      if (data.user) {
        sessionStorage.setItem("user", JSON.stringify(data.user));
      }

      if (data.user?.role && data.user.role !== "faculty") {
        try {
          await api.post("/auth/logout");
        } catch {
          /* best effort */
        }
        sessionStorage.removeItem("user");
        setError("This portal is for faculty attendance only. Use the main portal for admin access.");
        return;
      }

      if (data.mustChangePassword || data.user?.mustChangePassword) {
        setFlashMessage("Please set a new password to continue…");
        setTimeout(() => navigate("/change-password", { replace: true }), 800);
        return;
      }

      setFlashMessage("Successfully logged in! Redirecting…");
      setTimeout(() => navigate("/faculty/dashboard", { replace: true }), 800);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Could not connect to the server. Please try again later."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    setError("");
    setFlashMessage("Redirecting to Microsoft…");
    setLoading(true);
    try {
      const { data } = await api.get("/auth/microsoft/login");
      if (data.authUrl) {
        window.location.href = data.authUrl;
        return;
      }
      setFlashMessage("");
      setError(data.message || "Could not initiate Microsoft login.");
    } catch {
      setFlashMessage("");
      setError("Error connecting to authentication service.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 font-[Inter,system-ui,sans-serif]">
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
            <h1 className="text-2xl font-bold text-[#0B1F4B]">Faculty Login</h1>
            <p className="mt-1 text-sm text-slate-500">
              Sign in with your email and password, or with your KCT Microsoft account.
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

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@kct.ac.in"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                  required
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                  required
                  autoComplete="current-password"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !!flashMessage}
                className="w-full bg-[#0B1F4B] text-white py-3 rounded-xl hover:bg-[#122a5c] disabled:opacity-60 font-semibold text-sm transition-colors"
              >
                {loading || flashMessage ? "Please wait…" : "Login"}
              </button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 uppercase tracking-wide">or</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            <button
              type="button"
              onClick={handleMicrosoftLogin}
              disabled={loading || !!flashMessage}
              className="w-full flex items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-800 py-3.5 text-sm font-semibold shadow-sm transition-colors"
            >
              <MicrosoftIcon />
              {loading || flashMessage ? "Please wait…" : "Login with Microsoft"}
            </button>

            <p className="mt-5 text-center text-xs text-slate-500">
              Use the credentials shared by your Faculty Incharge, or your college Microsoft account (@kct.ac.in).
            </p>

            <p className="mt-5 text-center text-sm text-slate-500">
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
