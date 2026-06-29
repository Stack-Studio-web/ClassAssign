import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../assets/logo.png";
import api, { logout } from "../lib/api";

function FacultyLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
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

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <nav className="bg-white shadow px-6 py-4 flex items-center gap-3">
        <img src={Logo} alt="KCT Logo" className="h-10 w-auto" />
        <div>
          <p className="font-semibold text-sm">Faculty Attendance Portal</p>
          <p className="text-xs text-gray-500">ClassAssign Exam Seating System</p>
        </div>
      </nav>

      <div className="flex-grow flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Faculty Login</h1>
          <p className="text-sm text-gray-500 mb-6">Sign in to mark exam attendance</p>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="KCT Email"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 font-semibold"
            >
              {loading ? "Signing in..." : "Login"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Admin login?{" "}
            <button type="button" onClick={() => navigate("/login")} className="text-blue-600 hover:underline">
              Main portal
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default FacultyLogin;
