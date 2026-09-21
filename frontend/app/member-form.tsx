import React, { useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/contexts/ThemeContext";
import { api } from "@/src/api/client";
import Screen from "@/src/components/Screen";

const COLORS = ["#10B981", "#F43F5E", "#3B82F6", "#F59E0B", "#A855F7", "#06B6D4"];
const RELATIONS = ["Self", "Spouse", "Child", "Parent", "Sibling", "Other"];

export default function MemberForm() {
  const { theme } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("Self");
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const all = await api.get("/members");
      const m = all.find((x: any) => x.id === id);
      if (m) { setName(m.name); setRelation(m.relation || "Self"); setColor(m.color || COLORS[0]); }
    })();
  }, [id]);

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert("Missing info", "Name is required.");
      return;
    }
    setSaving(true);
    try {
      const capitalizedName = trimmedName.replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const body = { name: capitalizedName, relation, color };
      if (id) await api.put(`/members/${id}`, body);
      else await api.post("/members", body);
      router.back();
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to save member");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="close" size={24} color={theme.text} /></TouchableOpacity>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>{id ? "Edit" : "New"} Member</Text>
          <TouchableOpacity testID="save-member-btn" onPress={save} disabled={saving}><Text style={{ color: theme.text, fontWeight: "700", opacity: saving ? 0.5 : 1 }}>{saving ? "Saving..." : "Save"}</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
          <Field label="NAME"><TextInput testID="member-name" value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={theme.textMuted} autoCapitalize="words" style={inputStyle(theme)} /></Field>

          <Field label="RELATION">
            <View style={styles.chipRow}>
              {RELATIONS.map((r) => (
                <TouchableOpacity key={r} onPress={() => setRelation(r)}
                  style={[styles.chip, { backgroundColor: relation === r ? theme.primary : theme.surface, borderColor: relation === r ? theme.primary : theme.border }]}>
                  <Text style={{ color: relation === r ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12 }}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          <Field label="COLOR">
            <View style={styles.chipRow}>
              {COLORS.map((c) => (
                <TouchableOpacity key={c} onPress={() => setColor(c)} style={[styles.colorDot, { backgroundColor: c, borderColor: color === c ? theme.text : "transparent" }]} />
              ))}
            </View>
          </Field>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({ label, children }: any) {
  const { theme } = useTheme();
  return (<View style={{ marginTop: 20 }}><Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginBottom: 8 }}>{label}</Text>{children}</View>);
}
const inputStyle = (theme: any) => ({ borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: theme.text, borderColor: theme.border, backgroundColor: theme.surface, minHeight: 52 });
const styles = StyleSheet.create({
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 20 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
});
