import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/contexts/ThemeContext";
import type { IoniconName } from "@/src/constants/categoryIconOptions";

export default function FilterChip({
  label,
  active,
  onPress,
  icon,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: IoniconName;
  testID?: string;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? theme.primary : theme.background, borderColor: active ? theme.primary : theme.border }]}
    >
      {!!icon && <Ionicons name={icon} size={13} color={active ? theme.primaryText : theme.text} style={{ marginRight: 6 }} />}
      <Text style={{ color: active ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12 }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, height: 32, borderRadius: 999, borderWidth: 1 },
});
