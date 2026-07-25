import React from "react";
import { useNavigate } from "react-router-dom";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";

export default function MentorPlaceholder({ title, description }) {
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
        <div className="mx-auto w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mb-4">
          <WrenchScrewdriverIcon className="w-7 h-7 text-blue-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">{title}</h2>
        <p className="text-gray-500 mb-6">
          {description || "This section is coming soon. Check back in a future update."}
        </p>
        <button
          type="button"
          onClick={() => navigate("/mentor-portal/dashboard")}
          className="text-blue-600 hover:underline text-sm font-medium"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
