import React from "react";
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from "react-native";
import { useTheme } from "@/src/contexts/ThemeContext";

type Member = { id: string; name: string; relation?: string | null; color?: string };

export default function MemberChips({
  members,
  selected,
  onChange,
  testID = "member-chips",
}: {
  members: Member[];
  selected: string[];
  onChange: (ids: string[]) => void;
  testID?: string;
}) {
  const { theme } = useTheme();
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };
  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        testID={testID}
      >
        <Chip
          label="All"
          active={selected.length === 0}
          onPress={() => onChange([])}
          theme={theme}
          testID="chip-all"
        />
        {members.map((m) => (
          <Chip
            key={m.id}
            label={m.name}
            active={selected.includes(m.id)}
            onPress={() => toggle(m.id)}
            theme={theme}
            testID={`chip-${m.id}`}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function Chip({ label, active, onPress, theme, testID }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      testID={testID}
      activeOpacity={0.7}
      style={[
        styles.chip,
        {
          backgroundColor: active ? theme.primary : theme.surface,
          borderColor: active ? theme.primary : theme.border,
        },
      ]}
    >
      <Text style={{ color: active ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: { height: 56, marginTop: 8 },
  row: { paddingHorizontal: 24, gap: 8, alignItems: "center", height: 56 },
  chip: { height: 36, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, justifyContent: "center", flexShrink: 0 },
});
