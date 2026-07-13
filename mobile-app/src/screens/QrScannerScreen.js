import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, SafeAreaView, Alert } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import ScreenHeader from "../components/ScreenHeader";

export default function QrScannerScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [lastCode, setLastCode] = useState("");

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBarcode = ({ data }) => {
    if (scanned) return;
    setScanned(true);
    setLastCode(data);
    Alert.alert("QR Scanned", data, [
      { text: "Scan Again", onPress: () => setScanned(false) },
      { text: "Close", onPress: () => navigation.goBack() },
    ]);
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="QR Scanner" onBack={() => navigation.goBack()} />
        <Text style={styles.message}>Requesting camera permission…</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="QR Scanner" onBack={() => navigation.goBack()} />
        <Text style={styles.message}>
          Camera permission is required to scan student QR codes.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="QR Scanner" onBack={() => navigation.goBack()} />
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={scanned ? undefined : handleBarcode}
        />
        <View style={styles.overlay}>
          <Text style={styles.hint}>Align QR code within the frame</Text>
        </View>
      </View>
      {lastCode ? (
        <Text style={styles.result} accessibilityLiveRegion="polite">
          Last scan: {lastCode}
        </Text>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  cameraWrap: { flex: 1, overflow: "hidden" },
  overlay: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  hint: { color: "#fff", fontSize: 14, fontWeight: "600" },
  message: { padding: 24, color: "#64748B", textAlign: "center", fontSize: 15 },
  result: {
    padding: 16,
    color: "#E2E8F0",
    textAlign: "center",
    fontFamily: "monospace",
    fontSize: 13,
  },
});
