import React from "react";
import { usePermissions } from "../../hooks/useAuth";

export function PermissionGate({ permission, permissions = [], fallback = null, children }) {
  const { can } = usePermissions();
  const required = permission ? [permission, ...permissions] : permissions;
  const allowed = required.length === 0 || required.some((p) => can(p));
  if (!allowed) return fallback;
  return children;
}

export function AdminOnly({ fallback = null, children }) {
  const { isAdmin } = usePermissions();
  if (!isAdmin) return fallback;
  return children;
}

export function WriteAccess({ fallback = null, children }) {
  const { isReadOnly } = usePermissions();
  if (isReadOnly) return fallback;
  return children;
}
