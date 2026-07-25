import api from "./api";

const MENTOR_SESSION_KEY = "mentorUser";

export function getStoredMentorUser() {
  try {
    const raw = sessionStorage.getItem(MENTOR_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function fetchMentorUser() {
  try {
    const { data } = await api.get("/auth/mentor/me");
    sessionStorage.setItem(MENTOR_SESSION_KEY, JSON.stringify(data));
    return data;
  } catch {
    sessionStorage.removeItem(MENTOR_SESSION_KEY);
    return null;
  }
}

export async function mentorLogin(email, password, rememberMe = false) {
  const { data } = await api.post("/auth/mentor/login", { email, password, rememberMe });
  if (data.success && data.user) {
    sessionStorage.setItem(MENTOR_SESSION_KEY, JSON.stringify(data.user));
  }
  return data;
}

export async function mentorLogout(redirectTo = "/mentor-portal/login") {
  try {
    await api.post("/auth/mentor/logout");
  } catch {
    /* best effort */
  } finally {
    sessionStorage.removeItem(MENTOR_SESSION_KEY);
    window.location.href = redirectTo;
  }
}

export async function mentorChangePassword(currentPassword, newPassword) {
  const { data } = await api.post("/auth/mentor/change-password", {
    currentPassword,
    newPassword,
  });
  if (data.success) {
    const user = getStoredMentorUser();
    if (user) {
      user.mustChangePassword = false;
      sessionStorage.setItem(MENTOR_SESSION_KEY, JSON.stringify(user));
    }
  }
  return data;
}

export async function startMentorMicrosoftLogin() {
  const { data } = await api.get("/auth/microsoft/login?portal=mentor");
  return data;
}

export async function fetchMentorDashboard() {
  const { data } = await api.get("/mentor-portal/dashboard");
  return data.data ?? data;
}

export async function fetchMentorStudents(params = {}) {
  const { data } = await api.get("/mentor-portal/students", { params });
  return data.data ?? data;
}

export async function fetchMentorStudentDetail(uuid) {
  const { data } = await api.get(`/mentor-portal/students/${uuid}`);
  return data.data?.student ?? data.student;
}

export async function fetchMentorStudentFilterOptions() {
  const { data } = await api.get("/mentor-portal/students-filters/options");
  return data.data ?? data;
}
