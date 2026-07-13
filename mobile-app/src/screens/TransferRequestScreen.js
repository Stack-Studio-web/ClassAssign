import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  searchFacultyByEmail,
  checkTransferAvailability,
  submitTransferRequest,
} from "../services/transferService";
import ScreenHeader from "../components/ScreenHeader";
import OfflineBanner from "../components/OfflineBanner";
import { useAbortableEffect } from "../hooks";
import { ApiError } from "../api/errors";

export default function TransferRequestScreen({ route, navigation }) {
  const { exam } = route.params;
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [lookup, setLookup] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [checking, setChecking] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useAbortableEffect((signal) => {
    const value = email.trim().toLowerCase();
    if (!value.endsWith("@kct.ac.in") || value.length < 13) {
      setLookup(null);
      setAvailability(null);
      setLookupError("");
      return undefined;
    }

    const timer = setTimeout(async () => {
      setChecking(true);
      setLookupError("");
      try {
        const [search, avail] = await Promise.all([
          searchFacultyByEmail(value, signal),
          checkTransferAvailability(exam.uuid, value, signal),
        ]);
        setLookup(search);
        setAvailability(avail);
      } catch (err) {
        if (err.code === "CANCELLED") return;
        setLookup(null);
        setAvailability(null);
        setLookupError(err.message || "Could not verify faculty email");
      } finally {
        setChecking(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [email, exam.uuid]);

  const facultyMissing = lookup?.valid && lookup?.exists === false;
  const canSubmit =
    reason.trim().length >= 5 &&
    email.trim().endsWith("@kct.ac.in") &&
    (!facultyMissing || name.trim().length >= 2) &&
    (facultyMissing || availability?.available === true);

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await submitTransferRequest({
        assignmentUuid: exam.uuid,
        requestedEmail: email.trim().toLowerCase(),
        requestedName: facultyMissing ? name.trim() : undefined,
        reason: reason.trim(),
      });
      Alert.alert("Submitted", "Transfer request submitted. Awaiting admin approval.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err.message || "Failed to submit request";
      Alert.alert("Error", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <OfflineBanner />
      <ScreenHeader title="Request Transfer" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.label}>Exam: {exam.examName}</Text>
          <Text style={styles.label}>Venue: {exam.venueName}</Text>
          <Text style={styles.label}>
            Date: {exam.examDate} · {exam.examSession}
          </Text>
          <Text style={styles.cutoffNote}>
            Transfers must be submitted at least 20 minutes before exam start.
          </Text>
        </View>

        <Text style={styles.fieldLabel}>Replacement Email (@kct.ac.in)</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="name@kct.ac.in"
          accessibilityLabel="Replacement faculty email"
        />
        {checking && <Text style={styles.hint}>Checking…</Text>}
        {lookupError ? <Text style={styles.errorHint}>{lookupError}</Text> : null}

        {lookup?.exists && lookup?.faculty && (
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>{lookup.faculty.name}</Text>
            <Text style={styles.infoText}>{lookup.faculty.department}</Text>
          </View>
        )}

        {facultyMissing && (
          <>
            <Text style={styles.fieldLabel}>Faculty Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              accessibilityLabel="New faculty name"
            />
          </>
        )}

        {availability && lookup?.exists && (
          <View style={[styles.infoBox, !availability.available && styles.errorBox]}>
            <Text style={styles.infoText}>{availability.message}</Text>
          </View>
        )}

        <Text style={styles.fieldLabel}>Reason</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={reason}
          onChangeText={setReason}
          multiline
          placeholder="Why do you need a replacement?"
          accessibilityLabel="Transfer reason"
        />

        <TouchableOpacity
          style={[styles.button, (!canSubmit || submitting) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
          accessibilityRole="button"
          accessibilityLabel="Submit transfer request"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Submit Request</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  label: { fontSize: 13, color: "#64748B", marginBottom: 4 },
  cutoffNote: { fontSize: 12, color: "#92400E", marginTop: 8, fontWeight: "500" },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: "#334155", marginBottom: 6 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  textarea: { minHeight: 90, textAlignVertical: "top" },
  hint: { fontSize: 12, color: "#94A3B8", marginBottom: 8 },
  errorHint: { fontSize: 12, color: "#DC2626", marginBottom: 8 },
  infoBox: { backgroundColor: "#EEF2FF", borderRadius: 10, padding: 12, marginBottom: 12 },
  errorBox: { backgroundColor: "#FEF2F2" },
  infoTitle: { fontWeight: "600", color: "#312E81" },
  infoText: { color: "#4338CA", fontSize: 13 },
  button: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    minHeight: 52,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
