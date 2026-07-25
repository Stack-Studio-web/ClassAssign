import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Logo from "../../assets/logo.png";
import {
  fetchMentorUser,
  mentorLogin,
  startMentorMicrosoftLogin,
} from "../../lib/mentorPortalApi";

export default function MentorLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [flashMessage, setFlashMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const errorMsg = searchParams.get("error");
    if (errorMsg) setError(decodeURIComponent(errorMsg));
    if (searchParams.get("sso_success") === "true") {
      completeSsoLogin();
    }
  }, [searchParams]);

  const completeSsoLogin = async () => {
    try {
      const user = await fetchMentorUser();
      if (!user) {
        setError("Failed to complete Microsoft login");
        return;
      }
      setFlashMessage("Successfully logged in! Redirecting...");
      setTimeout(
        () =>
          navigate(
            user.mustChangePassword ? "/mentor-portal/change-password" : "/mentor-portal/dashboard",
            { replace: true }
          ),
        800
      );
    } catch {
      setError("Failed to complete Microsoft login");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setFlashMessage("");
    setLoading(true);
    try {
      const data = await mentorLogin(email, password, rememberMe);
      if (!data.success) {
        setError(data.message || "Login failed");
        return;
      }
      setFlashMessage("Successfully logged in! Redirecting...");
      setTimeout(
        () =>
          navigate(
            data.mustChangePassword ? "/mentor-portal/change-password" : "/mentor-portal/dashboard",
            { replace: true }
          ),
        800
      );
    } catch (err) {
      setError(err.response?.data?.message || "Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    setError("");
    setFlashMessage("Redirecting to Microsoft...");
    try {
      const data = await startMentorMicrosoftLogin();
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
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <nav className="bg-white shadow px-6 py-4 flex items-center gap-3">
        <img src={Logo} alt="KCT Logo" className="h-10 w-auto" />
        <div>
          <p className="font-semibold text-sm">Mentor Portal</p>
          <p className="text-xs text-gray-500">Exam Seating & Attendance Management</p>
        </div>
      </nav>

      <div className="flex-grow flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Mentor Login</h1>
          <p className="text-sm text-gray-500 mb-6">Sign in to manage your assigned students</p>
          <p className="text-xs text-gray-500 mb-4 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            First-time email login? Use the default password{" "}
            <span className="font-mono font-medium">YourStr0ng!Pass</span> — you will be asked to change it.
          </p>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          {flashMessage && (
            <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm">
              {flashMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mentor Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@kct.ac.in"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-gray-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Remember Me
              </label>
              <button
                type="button"
                className="text-blue-600 hover:underline"
                onClick={() => setError("Please contact the Faculty Incharge to reset your password.")}
              >
                Forgot Password?
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-60 font-semibold"
            >
              {loading ? "Signing in..." : "Login"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 uppercase">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <button
            type="button"
            onClick={handleMicrosoftLogin}
            className="w-full flex items-center justify-center gap-2 border border-gray-300 py-2.5 rounded-lg hover:bg-gray-50 font-medium text-gray-700"
          >
            <svg className="w-5 h-5" viewBox="0 0 21 21" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Sign in with Microsoft
          </button>
        </div>
      </div>
    </div>
  );
}
