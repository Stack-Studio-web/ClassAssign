export const lightColors = {
  background: "#F8FAFC",
  surface: "#FFFFFF",
  text: "#0F172A",
  textMuted: "#64748B",
  primary: "#2563EB",
  primaryDark: "#4F46E5",
  danger: "#DC2626",
  success: "#16A34A",
  border: "#E2E8F0",
  bannerOffline: "#FEF3C7",
  bannerOfflineText: "#92400E",
};

export const darkColors = {
  background: "#0F172A",
  surface: "#1E293B",
  text: "#F8FAFC",
  textMuted: "#94A3B8",
  primary: "#60A5FA",
  primaryDark: "#818CF8",
  danger: "#F87171",
  success: "#4ADE80",
  border: "#334155",
  bannerOffline: "#422006",
  bannerOfflineText: "#FDE68A",
};

export function getColors(scheme) {
  return scheme === "dark" ? darkColors : lightColors;
}
