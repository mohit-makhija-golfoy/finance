import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "@/src/contexts/ThemeContext";

type Props = {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  testID?: string;
};

export default function Checkbox({ value, onChange, label, testID }: Props) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      testID={testID}
      onPress={() => onChange(!value)}
      activeOpacity={0.7}
      style={styles.row}
    >
      <View style={[styles.box, { borderColor: theme.border, backgroundColor: value ? theme.primary : "transparent" }]}>
        {value && <Text style={{ color: theme.primaryText, fontSize: 14, fontWeight: "900", lineHeight: 16 }}>✓</Text>}
      </View>
      {!!label && <Text style={{ color: theme.text, fontSize: 14, flex: 1 }}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, flexGrow: 0, flexShrink: 0 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
