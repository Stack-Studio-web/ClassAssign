// src/screens/LoginScreen.js
import React, { useState } from "react";
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
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { getMicrosoftLoginUrl } from "../services/authService";

const LoginScreen = ({ navigation }) => {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* ─── Manual Login ──────────────────────────────────────── */
  const handleLogin = async () => {
    setError("");

    // Basic client-side validation
    if (!email.trim()) {
      setError("Please enter your KCT email.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    try {
      const data = await login(email.trim().toLowerCase(), password);

      // Faculty attendance roles go to dashboard; others use legacy home
      if (data.user.role === "faculty") {
        navigation?.replace("FacultyDashboard");
      } else {
        setError("This app is for faculty attendance login only.");
      }
    } catch (err) {
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ─── Microsoft SSO ─────────────────────────────────────── */
  const handleMicrosoftLogin = async () => {
    try {
      const url = getMicrosoftLoginUrl();
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Error", "Cannot open Microsoft login page.");
      }
    } catch {
      Alert.alert("Error", "Microsoft login unavailable.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Logo */}
      <Image
        source={require("../../assets/logo.png")}
        style={styles.logo}
      />

      {/* Title */}
      <Text style={styles.title}>Hallora</Text>
      <Text style={styles.subtitle}>Smart Seating</Text>

      {/* Error banner */}
      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Email */}
      <View style={[styles.inputContainer, error && !email && styles.inputError]}>
        <Ionicons name="mail-outline" size={20} color="#666" />
        <TextInput
          placeholder="KCT Email"
          placeholderTextColor="#999"
          style={styles.input}
          value={email}
          onChangeText={(t) => { setEmail(t); setError(""); }}
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="next"
          editable={!loading}
        />
      </View>

      {/* Password */}
      <View style={[styles.inputContainer, error && !password && styles.inputError]}>
        <Ionicons name="lock-closed-outline" size={20} color="#666" />
        <TextInput
          placeholder="Password"
          placeholderTextColor="#999"
          secureTextEntry={!showPassword}
          style={styles.input}
          value={password}
          onChangeText={(t) => { setPassword(t); setError(""); }}
          returnKeyType="done"
          onSubmitEditing={handleLogin}
          editable={!loading}
        />
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
          <Ionicons
            name={showPassword ? "eye-outline" : "eye-off-outline"}
            size={22}
            color="#666"
          />
        </TouchableOpacity>
      </View>

      {/* Login Button */}
      <TouchableOpacity
        style={[styles.loginButton, loading && styles.loginButtonDisabled]}
        onPress={handleLogin}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.loginText}>Login</Text>
        )}
      </TouchableOpacity>

      {/* Divider */}
      <View style={styles.dividerContainer}>
        <View style={styles.divider} />
        <Text style={styles.orText}>OR</Text>
        <View style={styles.divider} />
      </View>

      {/* Microsoft Login */}
      <TouchableOpacity
        style={styles.msButton}
        onPress={handleMicrosoftLogin}
        disabled={loading}
        activeOpacity={0.85}
      >
        <Ionicons name="logo-microsoft" size={22} color="#2563EB" />
        <Text style={styles.msText}>Continue with Microsoft</Text>
      </TouchableOpacity>

      {/* Footer */}
      <Text style={styles.footer}>Kumaraguru College of Technology</Text>
    </SafeAreaView>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 25,
  },
  logo: {
    width: 120,
    height: 120,
    resizeMode: "contain",
    marginBottom: 20,
  },
  title: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 6,
    marginBottom: 35,
  },
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
  errorText: {
    color: "#DC2626",
    fontSize: 13,
    flex: 1,
  },
  inputContainer: {
    width: "100%",
    height: 55,
    backgroundColor: "#fff",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  inputError: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FFF5F5",
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: "#0F172A",
  },
  loginButton: {
    width: "100%",
    height: 55,
    backgroundColor: "#2563EB",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  loginButtonDisabled: {
    backgroundColor: "#93C5FD",
  },
  loginText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 30,
    width: "100%",
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "#CBD5E1",
  },
  orText: {
    marginHorizontal: 10,
    color: "#64748B",
    fontWeight: "500",
  },
  msButton: {
    width: "100%",
    height: 55,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  msText: {
    marginLeft: 10,
    fontSize: 16,
    color: "#0F172A",
    fontWeight: "500",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    color: "#94A3B8",
    fontSize: 13,
  },
});