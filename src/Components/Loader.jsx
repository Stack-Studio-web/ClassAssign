import React from "react";
import logo from "../assets/logo.png";

const SIZE_MAP = {
  sm: { ring: "h-12 w-12", logo: "h-8 w-8" },
  md: { ring: "h-16 w-16", logo: "h-11 w-11" },
  lg: { ring: "h-24 w-24", logo: "h-16 w-16" },
  xl: { ring: "h-32 w-32", logo: "h-20 w-20" },
};

export default function Loader({
  message = "Loading...",
  fullPage = false,
  size = "lg",
  className = "",
}) {
  const dims = SIZE_MAP[size] || SIZE_MAP.lg;

  const content = (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      <div
        className={`relative flex items-center justify-center ${dims.ring}`}
        role="status"
        aria-label={message || "Loading"}
      >
        <div
          className={`absolute inset-0 rounded-full border-2 border-blue-100 border-t-blue-600 animate-spin`}
        />
        <img
          src={logo}
          alt=""
          aria-hidden="true"
          className={`relative ${dims.logo} object-contain logo-loader-pulse drop-shadow-sm`}
        />
      </div>
      {message ? (
        <p className="text-sm font-medium text-gray-600 tracking-wide">{message}</p>
      ) : null}
    </div>
  );

  if (fullPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        {content}
      </div>
    );
  }

  return content;
}
