import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  timeout: 60000,
});

function loginRedirectPath() {
  if (window.location.pathname.startsWith("/mentor-portal")) {
    if (window.location.pathname === "/mentor-portal/change-password") {
      return "/mentor-portal/change-password";
    }
    return "/mentor-portal/login";
  }
  if (window.location.pathname.startsWith("/faculty") || window.location.pathname.startsWith("/attendance/login")) {
    return "/attendance/login";
  }
  return "/login";
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = String(error.config?.url || "");
      const isAuthEndpoint =
        url.includes("/auth/me") ||
        url.includes("/auth/login") ||
        url.includes("/auth/mentor/me") ||
        url.includes("/auth/mentor/login");

      sessionStorage.removeItem("user");
      sessionStorage.removeItem("mentorUser");

      if (!isAuthEndpoint) {
        const path = loginRedirectPath();
        if (!window.location.pathname.startsWith(path) && window.location.pathname !== "/") {
          window.location.href = path;
        }
      }
    } else if (error.response?.status === 403) {
      return Promise.reject({
        ...error,
        isForbidden: true,
        message:
          error.response?.data?.details ||
          error.response?.data?.message ||
          error.response?.data?.error ||
          "You do not have permission to perform this action.",
      });
    } else if (error.response?.status === 409) {
      return Promise.reject({
        ...error,
        isConflict: true,
        message:
          error.response?.data?.details ||
          error.response?.data?.message ||
          "Operation not allowed due to existing dependencies.",
      });
    }
    return Promise.reject(error);
  }
);

export async function fetchCurrentUser() {
  try {
    const { data } = await api.get("/auth/me");
    sessionStorage.setItem("user", JSON.stringify(data));
    return data;
  } catch {
    sessionStorage.removeItem("user");
    return null;
  }
}

export async function logout(redirectTo) {
  try {
    await api.post("/auth/logout");
  } catch {
    /* best effort */
  } finally {
    sessionStorage.removeItem("user");
    window.location.href = redirectTo || loginRedirectPath();
  }
}

export default api;
