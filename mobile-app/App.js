// App.js
import React from "react";
import { ActivityIndicator, View, StyleSheet, Linking } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { AuthProvider, useAuth } from "./src/context/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import FacultyDashboardScreen from "./src/screens/FacultyDashboardScreen";
import ExamListScreen from "./src/screens/ExamListScreen";
import AttendanceScreen from "./src/screens/AttendanceScreen";
import AttendanceSummaryScreen from "./src/screens/AttendanceSummaryScreen";

const Stack = createNativeStackNavigator();

const ATTENDANCE_ROLES = new Set(["faculty"]);

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

function FacultyStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FacultyDashboard" component={FacultyDashboardScreen} />
      <Stack.Screen name="ExamList" component={ExamListScreen} />
      <Stack.Screen name="Attendance" component={AttendanceScreen} />
      <Stack.Screen name="AttendanceSummary" component={AttendanceSummaryScreen} />
    </Stack.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
    </Stack.Navigator>
  );
}

function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!user) return <AuthStack />;

  if (ATTENDANCE_ROLES.has(user.role)) {
    return <FacultyStack />;
  }

  return <AppStack />;
}

function useMicrosoftDeepLink() {
  const { loginWithMicrosoft } = useAuth();

  React.useEffect(() => {
    const handle = async ({ url }) => {
      if (!url) return;
      const match = url.match(/[?&]token=([^&]+)/);
      if (match) {
        try {
          await loginWithMicrosoft(decodeURIComponent(match[1]));
        } catch (e) {
          console.error("Microsoft login callback error:", e);
        }
      }
    };

    const sub = Linking.addEventListener("url", handle);
    Linking.getInitialURL().then((url) => { if (url) handle({ url }); });
    return () => sub.remove();
  }, [loginWithMicrosoft]);
}

function InnerApp() {
  useMicrosoftDeepLink();
  return (
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <InnerApp />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
});
