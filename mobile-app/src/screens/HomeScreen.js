// src/screens/HomeScreen.js
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
  Platform,
  StatusBar as RNStatusBar,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import ProfileScreen from "./ProfileScreen";

// ── Calendar helpers ──────────────────────────────────────────
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

function Calendar() {
  const today = new Date();

  const [current, setCurrent] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });

  const { year, month } = current;

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const prevMonth = () =>
    setCurrent(
      month === 0
        ? { year: year - 1, month: 11 }
        : { year, month: month - 1 }
    );

  const nextMonth = () =>
    setCurrent(
      month === 11
        ? { year: year + 1, month: 0 }
        : { year, month: month + 1 }
    );

  const cells = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isToday = (day) =>
    day === today.getDate() &&
    month === today.getMonth() &&
    year === today.getFullYear();

  return (
    <View style={cal.wrapper}>
      <View style={cal.header}>
        <TouchableOpacity onPress={prevMonth} style={cal.navBtn}>
          <Text style={cal.monthLabel}>
            {MONTHS[month]} {year}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#2563EB" />
        </TouchableOpacity>

        <View style={cal.arrows}>
          <TouchableOpacity onPress={prevMonth} style={cal.arrowBtn}>
            <Ionicons name="chevron-back" size={20} color="#4B9EFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={nextMonth} style={cal.arrowBtn}>
            <Ionicons name="chevron-forward" size={20} color="#4B9EFF" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={cal.dayRow}>
        {DAYS.map((d) => (
          <Text key={d} style={cal.dayLabel}>
            {d}
          </Text>
        ))}
      </View>

      <View style={cal.grid}>
        {cells.map((day, idx) => (
          <View key={idx} style={cal.cell}>
            {day ? (
              <View style={[cal.dateWrap, isToday(day) && cal.todayWrap]}>
                <Text style={[cal.dateText, isToday(day) && cal.todayText]}>
                  {day}
                </Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Bottom Nav ────────────────────────────────────────────────

const TABS = [
  { name: "Home",    icon: "home-outline",          iconActive: "home" },
  { name: "Sheet",   icon: "document-text-outline",  iconActive: "document-text" },
  { name: "Saved",   icon: "bookmark-outline",        iconActive: "bookmark" },
  { name: "Profile", icon: "person-outline",          iconActive: "person" },
];

function BottomNav({ active, onSelect }) {
  return (
    <View style={nav.bar}>
      {TABS.map((tab) => {
        const isActive = active === tab.name;
        return (
          <TouchableOpacity
            key={tab.name}
            style={nav.tab}
            onPress={() => onSelect(tab.name)}
          >
            <Ionicons
              name={isActive ? tab.iconActive : tab.icon}
              size={24}
              color={isActive ? "#0F172A" : "#94A3B8"}
            />
            <Text style={[nav.label, isActive && nav.labelActive]}>
              {tab.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Home Content ──────────────────────────────────────────────

function HomeTab() {
  const { user } = useAuth();

  const displayName =
    user?.username ||
    user?.email?.split("@")[0] ||
    "User";

  return (
    <>
      {/* HEADER */}
      <View style={styles.headerContainer}>
        <View style={styles.headerLeft}>
          <Image
            source={require("../../assets/logo.png")}
            style={styles.logo}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.collegeName}>Kumaraguru College of Technology</Text>
          </View>
        </View>
        <Ionicons name="settings-outline" size={25} color="#0F172A" />
      </View>

      <Text style={styles.welcome}>
        Welcome,{" "}
        <Text style={styles.username}>{displayName}</Text>
      </Text>

      <View style={styles.calendarCard}>
        <Calendar />
      </View>
    </>
  );
}

// ── Main Screen ───────────────────────────────────────────────

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState("Home");

  if (activeTab === "Profile") {
    return (
      <SafeAreaView style={styles.container}>
        {/* ✅ Android: transparent status bar with dark icons */}
        <StatusBar style="dark" backgroundColor="transparent" translucent />

        <ProfileScreen onBack={() => setActiveTab("Home")} />
        <BottomNav active={activeTab} onSelect={setActiveTab} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* ✅ Android: transparent status bar with dark icons */}
      <StatusBar style="dark" backgroundColor="transparent" translucent />

      <HomeTab />
      <BottomNav active={activeTab} onSelect={setActiveTab} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    // ✅ Android: push content below the notification/status bar
    paddingTop: Platform.OS === "android" ? RNStatusBar.currentHeight : 0,
  },

  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },

  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  logo: {
    width: 55,
    height: 55,
    marginRight: 10,
  },

  collegeName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },

  department: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },

  welcome: {
    fontSize: 20,
    color: "#94A3B8",
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 8,
  },

  username: {
    color: "#003199",
    fontWeight: "800",
  },

  calendarCard: {
    flex: 1,
    marginHorizontal: 12,
    marginTop: 16,
  },
});

const cal = StyleSheet.create({
  wrapper: { flex: 1 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },

  navBtn: {
    flexDirection: "row",
    alignItems: "center",
  },

  monthLabel: {
    fontSize: 17,
    fontWeight: "700",
    color: "#2563EB",
  },

  arrows: {
    flexDirection: "row",
  },

  arrowBtn: {
    padding: 4,
  },

  dayRow: {
    flexDirection: "row",
  },

  dayLabel: {
    flex: 1,
    textAlign: "center",
    color: "#94A3B8",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  dateWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },

  todayWrap: {
    backgroundColor: "#FFC0CB",
  },

  dateText: {
    fontSize: 15,
  },

  todayText: {
    fontWeight: "700",
  },
});

const nav = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#fff",
    paddingVertical: 10,
    // ✅ Android: extra space for the gesture/system navigation bar
    paddingBottom: Platform.OS === "android" ? 20 : 10,
  },

  tab: {
    flex: 1,
    alignItems: "center",
  },

  label: {
    fontSize: 11,
    color: "#94A3B8",
  },

  labelActive: {
    color: "#0F172A",
    fontWeight: "600",
  },
});