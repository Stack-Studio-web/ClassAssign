import { useCallback, useEffect, useState } from "react";
import { fetchCurrentUser } from "../lib/api";
import { hasPermission, isAdmin, isFacultyIncharge, isHod, isReadOnly } from "../lib/rbac/permissions";

/**
 * @returns {{
 *   user: import('./permissions').AuthUser | null,
 *   loading: boolean,
 *   role: string | undefined,
 *   department: string | undefined,
 *   refresh: () => Promise<void>,
 *   can: (permission: string) => boolean,
 *   isAdmin: boolean,
 *   isFacultyIncharge: boolean,
 *   isHod: boolean,
 *   isReadOnly: boolean,
 * }}
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const current = await fetchCurrentUser();
      setUser(current);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const role = user?.role;

  return {
    user,
    loading,
    role,
    department: user?.department,
    refresh,
    can: (permission) => hasPermission(role, permission),
    isAdmin: isAdmin(role),
    isFacultyIncharge: isFacultyIncharge(role),
    isHod: isHod(role),
    isReadOnly: isReadOnly(role),
  };
}

export function usePermissions() {
  const auth = useAuth();
  return auth;
}
