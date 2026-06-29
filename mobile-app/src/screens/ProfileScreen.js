// src/screens/ProfileScreen.js
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";

// ── Avatar: first letter of username in a circle ─────────────
function Avatar({ name }) {
  const letter = (name || "U")[0].toUpperCase();
  return (
    <View style={avatar.circle}>
      <Text style={avatar.letter}>{letter}</Text>
    </View>
  );
}

// ── Info Row ─────────────────────────────────────────────────
function InfoRow({ icon, label, value }) {
  return (
    <View style={info.row}>
      <View style={info.iconWrap}>
        <Ionicons name={icon} size={18} color="#2563EB" />
      </View>
      <View style={info.textWrap}>
        <Text style={info.label}>{label}</Text>
        <Text style={info.value}>{value}</Text>
      </View>
    </View>
  );
}

// ── Profile Screen ────────────────────────────────────────────
export default function ProfileScreen({ onBack, onLogout }) {
  const { user, logout } = useAuth();

  const displayName = user?.username || user?.email?.split("@")[0] || "User";
  const email       = user?.email      || "—";
  const role        = user?.role       || "—";
  const department  = user?.department || "—";

  // Capitalise role nicely: "faculty_incharge" → "Faculty Incharge"
  const formatRole = (r) =>
    r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await logout();
          onLogout?.();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Avatar + Name */}
        <View style={styles.heroSection}>
          <Avatar name={displayName} />
          <Text style={styles.name}>{displayName}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>{formatRole(role)}</Text>
          </View>
        </View>

        {/* Info Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account Details</Text>
          <InfoRow icon="mail-outline"   label="Email"      value={email} />
          <View style={styles.divider} />
          <InfoRow icon="shield-outline" label="Role"       value={formatRole(role)} />
          <View style={styles.divider} />
          <InfoRow icon="business-outline" label="Department" value={department} />
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={20} color="#DC2626" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const avatar = StyleSheet.create({
  circle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  letter: {
    fontSize: 36,
    fontWeight: "700",
    color: "#fff",
  },
});

const info = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  textWrap: { flex: 1 },
  label: {
    fontSize: 12,
    color: "#94A3B8",
    marginBottom: 2,
    fontWeight: "500",
  },
  value: {
    fontSize: 15,
    color: "#0F172A",
    fontWeight: "500",
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#fff",
  },
  backBtn: {
    width: 32,
    height: 32,
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  scroll: {
    paddingBottom: 40,
  },
  heroSection: {
    alignItems: "center",
    paddingTop: 36,
    paddingBottom: 28,
  },
  name: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 16,
    marginBottom: 8,
  },
  rolePill: {
    backgroundColor: "#EFF6FF",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  rolePillText: {
    fontSize: 13,
    color: "#2563EB",
    fontWeight: "600",
  },
  card: {
    marginHorizontal: 20,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingTop: 16,
    paddingBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 20,
    marginTop: 28,
    height: 52,
    backgroundColor: "#FEF2F2",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
    gap: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#DC2626",
  },
});