import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "../context/AuthContext";
import { fetchMicrosoftAuthUrl, getMicrosoftRedirectUri } from "../services/authService";
import { ApiError } from "../api/errors";
import { useTheme } from "../context/ThemeContext";

WebBrowser.maybeCompleteAuthSession();

const LoginScreen = () => {
  const { login, loginWithMicrosoft, sessionExpired, clearSessionExpired } = useAuth();
  const { colors } = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msLoading, setMsLoading] = useState(false);
  const [error, setError] = useState("");
  const loginInFlight = useRef(false);

  React.useEffect(() => {
    if (sessionExpired) {
      setError("Your session expired. Please log in again.");
      clearSessionExpired();
    }
  }, [sessionExpired, clearSessionExpired]);

  const handleLogin = async () => {
    setError("");
    if (!email.trim()) {
      setError("Please enter your KCT email.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }
    if (loginInFlight.current) return;

    loginInFlight.current = true;
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      if (err instanceof ApiError && err.code === "RATE_LIMIT") {
        setError("Too many login attempts. Please wait a moment.");
      } else {
        setError(err.message || "Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
      loginInFlight.current = false;
    }
  };

  const handleMicrosoftLogin = async () => {
    if (msLoading) return;
    setMsLoading(true);
    setError("");
    try {
      const authUrl = await fetchMicrosoftAuthUrl();
      const redirectUri = getMicrosoftRedirectUri();
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type === "success" && result.url) {
        const matchToken = result.url.match(/[?&]token=([^&]+)/);
        const matchError = result.url.match(/[?&]error=([^&]+)/);
        if (matchError) {
          setError(decodeURIComponent(matchError[1]));
        } else if (matchToken) {
          await loginWithMicrosoft(decodeURIComponent(matchToken[1]));
        }
      }
    } catch (err) {
      setError(err.message || "Microsoft login unavailable.");
    } finally {
      setMsLoading(false);
    }
  };

  const busy = loading || msLoading;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Image
            source={require("../../assets/logo.png")}
            style={styles.logo}
            accessibilityLabel="KCT logo"
          />
          <Text style={[styles.title, { color: colors.text }]}>Hallora</Text>
          <Text style={styles.subtitle}>Faculty Attendance</Text>

          {error ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="mail-outline" size={20} color="#666" />
            <TextInput
              placeholder="KCT Email"
              placeholderTextColor="#999"
              style={[styles.input, { color: colors.text }]}
              value={email}
              onChangeText={(t) => { setEmail(t); setError(""); }}
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="next"
              editable={!busy}
              accessibilityLabel="Email address"
              maxFontSizeMultiplier={1.4}
            />
          </View>

          <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={20} color="#666" />
            <TextInput
              placeholder="Password"
              placeholderTextColor="#999"
              secureTextEntry={!showPassword}
              style={[styles.input, { color: colors.text }]}
              value={password}
              onChangeText={(t) => { setPassword(t); setError(""); }}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!busy}
              accessibilityLabel="Password"
              maxFontSizeMultiplier={1.4}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={22} color="#666" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, busy && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Login"
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginText}>Login</Text>}
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.divider} />
          </View>

          <TouchableOpacity
            style={[styles.msButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={handleMicrosoftLogin}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Continue with Microsoft"
          >
            {msLoading ? (
              <ActivityIndicator color="#2563EB" />
            ) : (
              <>
                <Ionicons name="logo-microsoft" size={22} color="#2563EB" />
                <Text style={[styles.msText, { color: colors.text }]}>Continue with Microsoft</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.footer}>Kumaraguru College of Technology</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 25,
    paddingBottom: 40,
  },
  logo: { width: 120, height: 120, resizeMode: "contain", marginBottom: 20 },
  title: { fontSize: 30, fontWeight: "bold" },
  subtitle: { fontSize: 14, color: "#64748B", marginTop: 6, marginBottom: 35 },
  errorBox: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    gap: 8,
  },
  errorText: { color: "#DC2626", fontSize: 13, flex: 1 },
  inputContainer: {
    width: "100%",
    minHeight: 55,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    marginBottom: 18,
    borderWidth: 1,
  },
  input: { flex: 1, marginLeft: 10, fontSize: 16 },
  loginButton: {
    width: "100%",
    minHeight: 55,
    backgroundColor: "#2563EB",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  loginButtonDisabled: { backgroundColor: "#93C5FD" },
  loginText: { color: "#fff", fontSize: 18, fontWeight: "600" },
  dividerContainer: { flexDirection: "row", alignItems: "center", marginVertical: 30, width: "100%" },
  divider: { flex: 1, height: 1, backgroundColor: "#CBD5E1" },
  orText: { marginHorizontal: 10, color: "#64748B", fontWeight: "500" },
  msButton: {
    width: "100%",
    minHeight: 55,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  msText: { fontSize: 16, fontWeight: "500" },
  footer: { marginTop: 40, color: "#94A3B8", fontSize: 13, textAlign: "center" },
});
