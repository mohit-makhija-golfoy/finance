import React from "react";
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/contexts/ThemeContext";
import { getInitials } from "@/src/utils/categoryIcons";

type Item = { id: string; name: string; relation?: string | null; color?: string | null };

export default function MemberChips({
  members,
  selected,
  onChange,
  testID = "member-chips",
  variant = "member",
  inline = false,
  wrap = false,
}: {
  members: Item[];
  selected: string[];
  onChange: (ids: string[]) => void;
  testID?: string;
  variant?: "member" | "tag";
  inline?: boolean;
  wrap?: boolean;
}) {
  const { theme } = useTheme();
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };

  const isMember = variant === "member";

  const content = (
    <>
      {isMember ? (
          <>
            <AvatarChip
              label="All"
              icon="people-outline"
              active={selected.length === 0}
              onPress={() => onChange([])}
              theme={theme}
              testID="chip-all"
            />
            {members.map((m) => (
              <AvatarChip
                key={m.id}
                label={m.name}
                initials={getInitials(m.name)}
                color={m.color}
                active={selected.includes(m.id)}
                onPress={() => toggle(m.id)}
                theme={theme}
                testID={`chip-${m.id}`}
              />
            ))}
          </>
        ) : (
          <>
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
                hash
                active={selected.includes(m.id)}
                onPress={() => toggle(m.id)}
                theme={theme}
                testID={`chip-${m.id}`}
              />
            ))}
          </>
        )}
    </>
  );

  if (wrap) {
    return (
      <View
        style={[styles.wrapRow, inline && { paddingHorizontal: 0 }]}
        testID={testID}
      >
        {content}
      </View>
    );
  }

  return (
    <View style={[{ height: isMember ? 76 : 44 }, !inline && { marginTop: 8 }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.row, inline && { paddingHorizontal: 0 }, isMember && { gap: 16, alignItems: "flex-start", height: 68 }]}
        testID={testID}
      >
        {content}
      </ScrollView>
    </View>
  );
}

function AvatarChip({ label, initials, icon, color, active, onPress, theme, testID }: any) {
  return (
    <TouchableOpacity onPress={onPress} testID={testID} activeOpacity={0.8} style={styles.avatarItem}>
      <View style={[styles.avatar, { backgroundColor: theme.surface, borderColor: active ? theme.positive : theme.border, borderWidth: active ? 2 : 1 }]}>
        {icon ? <Ionicons name={icon} size={18} color={theme.text} /> : <Text style={{ color: color || theme.text, fontWeight: "700", fontSize: 14 }}>{initials}</Text>}
        {active && (
          <View style={[styles.avatarCheck, { backgroundColor: theme.positive, borderColor: theme.background }]}>
            <Ionicons name="checkmark" size={9} color="#fff" />
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={{ color: active ? theme.text : theme.textMuted, fontSize: 11, fontWeight: active ? "700" : "600", marginTop: 6, maxWidth: 60, textAlign: "center" }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Chip({ label, hash, active, onPress, theme, testID }: any) {
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
      {hash && <Text style={{ color: active ? theme.primaryText : theme.textMuted, fontWeight: "700", fontSize: 13 }}>#</Text>}
      <Text style={{ color: active ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 13 }}>{label}</Text>
      {active && <Ionicons name="checkmark" size={13} color={theme.primaryText} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 24, gap: 8, alignItems: "center", height: 44 },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 24, gap: 8 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  avatarItem: { alignItems: "center", width: 60 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarCheck: { position: "absolute", right: -2, bottom: -2, width: 15, height: 15, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 2 },
});
