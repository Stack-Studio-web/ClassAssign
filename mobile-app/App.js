import React, { useEffect } from "react";
import { Linking } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Notifications from "expo-notifications";

import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { NetworkProvider } from "./src/context/NetworkContext";
import { ThemeProvider } from "./src/context/ThemeContext";
import ErrorBoundary from "./src/components/ErrorBoundary";
import LogoLoader from "./src/components/LogoLoader";
import OfflineBanner from "./src/components/OfflineBanner";
import LoginScreen from "./src/screens/LoginScreen";
import ChangePasswordScreen from "./src/screens/ChangePasswordScreen";
import FacultyDashboardScreen from "./src/screens/FacultyDashboardScreen";
import ExamListScreen from "./src/screens/ExamListScreen";
import AttendanceScreen from "./src/screens/AttendanceScreen";
import AttendanceSummaryScreen from "./src/screens/AttendanceSummaryScreen";
import TransferRequestScreen from "./src/screens/TransferRequestScreen";
import QrScannerScreen from "./src/screens/QrScannerScreen";
import { ALLOWED_MOBILE_ROLES } from "./src/constants";
import { checkDeviceIntegrity } from "./src/services/securityService";

const Stack = createNativeStackNavigator();

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
      <Stack.Screen name="TransferRequest" component={TransferRequestScreen} />
      <Stack.Screen name="QrScanner" component={QrScannerScreen} />
    </Stack.Navigator>
  );
}

function ChangePasswordStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
    </Stack.Navigator>
  );
}

function RootNavigator() {
  const { user, loading, mustChangePassword, logout } = useAuth();

  if (loading) {
    return <LogoLoader message="Restoring session..." />;
  }

  if (!user) {
    return (
      <>
        <OfflineBanner />
        <AuthStack />
      </>
    );
  }

  if (mustChangePassword) {
    return <ChangePasswordStack />;
  }

  if (!ALLOWED_MOBILE_ROLES.has(user.role)) {
    logout();
    return (
      <>
        <OfflineBanner />
        <AuthStack />
      </>
    );
  }

  return (
    <>
      <OfflineBanner />
      <FacultyStack />
    </>
  );
}

function useMicrosoftDeepLink() {
  const { loginWithMicrosoft } = useAuth();

  useEffect(() => {
    const handle = async ({ url }) => {
      if (!url || !url.includes("hallora://auth")) return;
      const matchToken = url.match(/[?&]token=([^&]+)/);
      const matchError = url.match(/[?&]error=([^&]+)/);
      if (matchError) return;
      if (matchToken) {
        try {
          await loginWithMicrosoft(decodeURIComponent(matchToken[1]));
        } catch {
          /* surfaced on login screen via auth state */
        }
      }
    };

    const sub = Linking.addEventListener("url", handle);
    Linking.getInitialURL().then((url) => {
      if (url) handle({ url });
    });
    return () => sub.remove();
  }, [loginWithMicrosoft]);
}

function useNotificationPermission() {
  useEffect(() => {
    Notifications.requestPermissionsAsync().catch(() => {});
  }, []);
}

function AppShell() {
  const { logout } = useAuth();
  useMicrosoftDeepLink();
  useNotificationPermission();

  useEffect(() => {
    checkDeviceIntegrity();
  }, []);

  return (
    <ErrorBoundary onLogout={logout}>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <NetworkProvider>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </NetworkProvider>
    </ThemeProvider>
  );
}
