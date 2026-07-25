import React from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../../assets/logo.png";
import { ShieldExclamationIcon } from "@heroicons/react/24/outline";

export default function MentorAccessDenied() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <nav className="bg-white shadow px-6 py-4 flex items-center gap-3">
        <img src={Logo} alt="KCT Logo" className="h-10 w-auto" />
        <div>
          <p className="font-semibold text-sm">Mentor Portal</p>
        </div>
      </nav>

      <div className="flex-grow flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md text-center">
          <div className="mx-auto w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
            <ShieldExclamationIcon className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-6">
            Your Microsoft account is not registered as a Mentor. Please contact the Faculty Incharge.
          </p>
          <button
            type="button"
            onClick={() => navigate("/mentor-portal/login", { replace: true })}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 font-medium"
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}
