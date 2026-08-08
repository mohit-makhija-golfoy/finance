import React, { useCallback, useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useRouter, Stack, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/contexts/ThemeContext";
import { api } from "@/src/api/client";
import Screen from "@/src/components/Screen";

export default function Tags() {
  const { theme } = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    const tags = await api.get("/tags");
    setItems(tags);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    await api.post("/tags", { name });
    setNewName("");
    load();
  };

  const remove = (id: string) => {
    Alert.alert("Delete tag?", "It will be removed from any transactions using it.", [
      { text: "Cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await api.del(`/tags/${id}`); load(); } },
    ]);
  };

  const edit = (id: string, name: string) => {
    if (Platform.OS === "web") {
      const v = window.prompt("New name", name);
      if (v) api.put(`/tags/${id}`, { name: v }).then(load);
    } else {
      Alert.prompt && Alert.prompt("Rename tag", "", (v) => {
        if (v) api.put(`/tags/${id}`, { name: v }).then(load);
      }, "plain-text", name);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="close" size={24} color={theme.text} /></TouchableOpacity>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Tags</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={{ padding: 24, paddingTop: 8 }}>
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>Tags are shared across income and expense, and a transaction can have more than one.</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 20 }}>
            <TextInput
              testID="new-tag-input"
              value={newName}
              onChangeText={setNewName}
              placeholder="New tag name"
              placeholderTextColor={theme.textMuted}
              style={[inputStyle(theme), { flex: 1 }]}
            />
            <TouchableOpacity testID="add-tag-btn" onPress={add} style={[styles.btn, { backgroundColor: theme.primary }]}>
              <Text style={{ color: theme.primaryText, fontWeight: "700" }}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 80 }}>
          {items.map((t) => (
            <View key={t.id} testID={`tag-row-${t.id}`} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={{ color: theme.text, fontSize: 16, flex: 1 }}>{t.name}</Text>
              <TouchableOpacity testID={`tag-edit-${t.id}`} onPress={() => edit(t.id, t.name)} style={{ padding: 8 }}>
                <Ionicons name="create-outline" size={20} color={theme.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity testID={`tag-del-${t.id}`} onPress={() => remove(t.id)} style={{ padding: 8 }}>
                <Ionicons name="trash-outline" size={20} color={theme.negative} />
              </TouchableOpacity>
            </View>
          ))}
          {items.length === 0 && <Text style={{ color: theme.textMuted, textAlign: "center", marginTop: 40 }}>No tags yet.</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const inputStyle = (theme: any) => ({ borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: theme.text, borderColor: theme.border, backgroundColor: theme.surface, minHeight: 52 });
const styles = StyleSheet.create({
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 20 },
  btn: { paddingHorizontal: 20, justifyContent: "center", borderRadius: 14 },
  row: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 8 },
});
