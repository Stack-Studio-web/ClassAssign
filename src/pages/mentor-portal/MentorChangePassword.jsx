import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../../assets/logo.png";
import { mentorChangePassword } from "../../lib/mentorPortalApi";

export default function MentorChangePassword() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters with upper, lower, number, and special character.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const data = await mentorChangePassword(currentPassword, newPassword);
      if (!data.success) {
        setError(data.message || "Failed to update password");
        return;
      }
      navigate(data.redirectTo || "/mentor-portal/dashboard", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <nav className="bg-white shadow px-6 py-4 flex items-center gap-3">
        <img src={Logo} alt="KCT Logo" className="h-10 w-auto" />
        <p className="font-semibold text-sm">Mentor Portal — Set a new password</p>
      </nav>

      <div className="flex-grow flex items-center justify-center p-6">
        <form onSubmit={handleSubmit} className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md space-y-4">
          <h1 className="text-xl font-bold text-center text-gray-900">Change Password</h1>
          <p className="text-sm text-gray-600 text-center">
            Your account uses the default password. Set a new password before continuing.
          </p>
          <p className="text-xs text-gray-500 text-center bg-gray-50 rounded-lg px-3 py-2">
            Default password: <span className="font-mono">YourStr0ng!Pass</span>
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            required
          />
          <input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            required
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-60 font-semibold"
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
