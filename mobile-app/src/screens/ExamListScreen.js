import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

/**
 * Exam list view — navigated from dashboard or used as a standalone exam picker.
 */
export default function ExamListScreen({ navigation, route }) {
  const exams = route.params?.exams || [];

  const openExam = (exam) => {
    navigation.navigate("Attendance", {
      assignmentUuid: exam.uuid,
      examName: exam.examName,
      venueName: exam.venueName,
      examDate: exam.examDate,
      examSession: exam.examSession,
      examTime: exam.examTime,
      facultyName: exam.facultyName,
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#2563EB" />
        </TouchableOpacity>
        <Text style={styles.title}>Assigned Exams</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={exams}
        keyExtractor={(item) => item.uuid}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No exams to display.</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => openExam(item)}>
            <Text style={styles.examName}>{item.examName}</Text>
            <Text style={styles.meta}>{item.venueName}</Text>
            <Text style={styles.meta}>
              {item.examDate} · {item.examTime}
            </Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 18, fontWeight: "600", color: "#0F172A" },
  list: { padding: 16 },
  empty: { textAlign: "center", color: "#64748B", marginTop: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  examName: { fontSize: 16, fontWeight: "600", color: "#0F172A" },
  meta: { fontSize: 13, color: "#64748B", marginTop: 4 },
});
