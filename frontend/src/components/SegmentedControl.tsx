import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "@/src/contexts/ThemeContext";

type Option = { key: string; label: string; testID?: string };

export default function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: string;
  onChange: (key: string) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: theme.background, borderColor: theme.border }]}>
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            testID={opt.testID}
            onPress={() => onChange(opt.key)}
            activeOpacity={0.8}
            style={[styles.segment, { backgroundColor: active ? theme.primary : "transparent" }]}
          >
            <Text style={{ color: active ? theme.primaryText : theme.textMuted, fontWeight: active ? "700" : "600", fontSize: 13 }}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", borderRadius: 14, borderWidth: 1, padding: 3, gap: 2 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: "center", justifyContent: "center" },
});
