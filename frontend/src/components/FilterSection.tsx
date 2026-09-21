import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/contexts/ThemeContext";
import type { IoniconName } from "@/src/constants/categoryIconOptions";

export default function FilterSection({
  icon,
  label,
  first,
  children,
}: {
  icon: IoniconName;
  label: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ marginTop: first ? 0 : 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <Ionicons name={icon} size={13} color={theme.textMuted} />
        <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700" }}>{label}</Text>
      </View>
      {children}
    </View>
  );
}
