import React, { useEffect, useRef } from "react";
import { View, Image, StyleSheet, Animated, Text } from "react-native";

export default function LogoLoader({ message = "Loading..." }) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      })
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    spinLoop.start();
    pulseLoop.start();
    return () => {
      spinLoop.stop();
      pulseLoop.stop();
    };
  }, [spin, pulse]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={message}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <View style={styles.ring} />
      </Animated.View>
      <Animated.Image
        source={require("../../assets/logo.png")}
        style={[styles.logo, { transform: [{ scale: pulse }] }]}
        accessibilityIgnoresInvertColors
      />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  ring: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: "#2563EB",
    borderTopColor: "transparent",
    marginTop: -12,
    marginLeft: -12,
  },
  logo: {
    width: 72,
    height: 72,
    resizeMode: "contain",
  },
  message: {
    marginTop: 20,
    color: "#64748B",
    fontSize: 14,
    fontWeight: "500",
  },
});
