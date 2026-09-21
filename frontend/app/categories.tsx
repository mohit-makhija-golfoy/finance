import React, { useCallback, useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useRouter, Stack, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/contexts/ThemeContext";
import { useToast } from "@/src/contexts/ToastContext";
import { api } from "@/src/api/client";
import Screen from "@/src/components/Screen";
import IconPickerModal from "@/src/components/IconPickerModal";
import { resolveCategoryIcon } from "@/src/utils/categoryIcons";
import { confirmAction } from "@/src/utils/confirm";
import type { IoniconName } from "@/src/constants/categoryIconOptions";

export default function Categories() {
  const { theme } = useTheme();
  const { showToast } = useToast();
  const router = useRouter();
  const [type, setType] = useState<"income" | "expense">("expense");
  const [items, setItems] = useState<any[]>([]);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState<IoniconName | null>(null);
  const [pickerFor, setPickerFor] = useState<"new" | string | null>(null);

  const load = useCallback(async () => {
    const cats = await api.get("/categories");
    setItems(cats);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    await api.post("/categories", { name, type, icon: newIcon });
    setNewName("");
    setNewIcon(null);
    load();
    showToast(`"${name}" category added`);
  };

  const remove = (id: string) => {
    confirmAction("Delete category?", "Existing transactions keep their category text.", "Delete", async () => {
      await api.del(`/categories/${id}`);
      load();
    });
  };

  const edit = (id: string, name: string, icon: string | null) => {
    if (Platform.OS === "web") {
      const v = window.prompt("New name", name);
      if (v) api.put(`/categories/${id}`, { name: v, type, icon }).then(load);
    } else {
      Alert.prompt && Alert.prompt("Rename category", "", (v) => {
        if (v) api.put(`/categories/${id}`, { name: v, type, icon }).then(load);
      }, "plain-text", name);
    }
  };

  const changeIcon = async (categoryId: string, name: string, icon: IoniconName) => {
    await api.put(`/categories/${categoryId}`, { name, type, icon });
    load();
  };

  const list = items.filter((c) => c.type === type);
  const editingCategory = typeof pickerFor === "string" ? list.find((c) => c.id === pickerFor) : null;

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="close" size={24} color={theme.text} /></TouchableOpacity>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Categories</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={{ padding: 24, paddingTop: 8 }}>
          <View style={styles.toggle}>
            {(["expense", "income"] as const).map((t) => (
              <TouchableOpacity key={t} testID={`cat-type-${t}`} onPress={() => setType(t)}
                style={[styles.toggleBtn, { backgroundColor: type === t ? theme.primary : theme.surface, borderColor: type === t ? theme.primary : theme.border }]}>
                <Text style={{ color: type === t ? theme.primaryText : theme.text, fontWeight: "700", textTransform: "capitalize" }}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 20 }}>
            <TouchableOpacity
              testID="new-category-icon-btn"
              onPress={() => setPickerFor("new")}
              style={[styles.iconAvatar, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <Ionicons name={newIcon || resolveCategoryIcon({ name: newName || "" })} size={20} color={theme.text} />
            </TouchableOpacity>
            <TextInput
              testID="new-category-input"
              value={newName}
              onChangeText={setNewName}
              placeholder="New category name"
              placeholderTextColor={theme.textMuted}
              style={[inputStyle(theme), { flex: 1 }]}
            />
            <TouchableOpacity testID="add-category-btn" onPress={add} style={[styles.btn, { backgroundColor: theme.primary }]}>
              <Text style={{ color: theme.primaryText, fontWeight: "700" }}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 80 }}>
          {list.map((c) => (
            <View key={c.id} testID={`cat-row-${c.id}`} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <TouchableOpacity testID={`cat-icon-${c.id}`} onPress={() => setPickerFor(c.id)} style={[styles.iconAvatar, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Ionicons name={resolveCategoryIcon(c)} size={18} color={theme.text} />
              </TouchableOpacity>
              <Text style={{ color: theme.text, fontSize: 16, flex: 1, marginLeft: 12 }}>{c.name}</Text>
              <TouchableOpacity testID={`cat-edit-${c.id}`} onPress={() => edit(c.id, c.name, c.icon || null)} style={{ padding: 8 }}>
                <Ionicons name="create-outline" size={20} color={theme.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity testID={`cat-del-${c.id}`} onPress={() => remove(c.id)} style={{ padding: 8 }}>
                <Ionicons name="trash-outline" size={20} color={theme.negative} />
              </TouchableOpacity>
            </View>
          ))}
          {list.length === 0 && <Text style={{ color: theme.textMuted, textAlign: "center", marginTop: 40 }}>No categories yet.</Text>}
        </ScrollView>
      </KeyboardAvoidingView>

      <IconPickerModal
        visible={pickerFor !== null}
        selected={pickerFor === "new" ? newIcon : editingCategory ? resolveCategoryIcon(editingCategory) : null}
        onClose={() => setPickerFor(null)}
        onSelect={(icon) => {
          if (pickerFor === "new") setNewIcon(icon);
          else if (editingCategory) changeIcon(editingCategory.id, editingCategory.name, icon);
        }}
      />
    </Screen>
  );
}

const inputStyle = (theme: any) => ({ borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: theme.text, borderColor: theme.border, backgroundColor: theme.surface, minHeight: 52 });
const styles = StyleSheet.create({
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 20 },
  toggle: { flexDirection: "row", gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 999, borderWidth: 1, alignItems: "center" },
  btn: { paddingHorizontal: 20, justifyContent: "center", borderRadius: 14 },
  row: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 8 },
  iconAvatar: { width: 52, height: 52, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
