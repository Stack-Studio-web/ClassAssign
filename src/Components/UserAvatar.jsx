import React, { useState } from "react";

/**
 * Circular profile image with initials fallback.
 * avatarUrl is a same-origin cookie-auth path (e.g. /api/auth/me/avatar).
 */
export default function UserAvatar({
  name = "User",
  avatarUrl = null,
  size = "md",
  className = "",
  bgClassName = "bg-indigo-500",
  textClassName = "text-white",
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const initial = String(name || "U").charAt(0).toUpperCase();

  const sizeClass =
    size === "sm"
      ? "h-8 w-8 text-xs"
      : size === "lg"
        ? "h-10 w-10 text-sm"
        : "h-9 w-9 text-sm";

  const showImage = Boolean(avatarUrl) && !imgFailed;

  if (showImage) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={`${sizeClass} rounded-full object-cover shrink-0 ring-1 ring-black/5 ${className}`}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full ${bgClassName} ${textClassName} flex items-center justify-center shrink-0 font-semibold ${className}`}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
