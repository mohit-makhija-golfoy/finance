import React from "react";
import { View, StyleSheet, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/src/contexts/ThemeContext";

export default function Screen({ children, edges = ["top", "bottom"] as const }: { children: React.ReactNode; edges?: readonly ("top" | "bottom" | "left" | "right")[] }) {
  const { theme, mode } = useTheme();
  return (
    <SafeAreaView edges={edges as any} style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={mode === "dark" ? "light-content" : "dark-content"} backgroundColor={theme.background} />
      <View style={styles.inner}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: { flex: 1 },
});
