import React, { useCallback, useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, Modal } from "react-native";
import { useRouter, Stack, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/contexts/ThemeContext";
import { api } from "@/src/api/client";
import Screen from "@/src/components/Screen";

type EditState = {
  id: string | null;
  keyword: string;
  category: string;
  type: "income" | "expense";
  tagIds: string[];
};

const BLANK_EDIT: EditState = { id: null, keyword: "", category: "", type: "expense", tagIds: [] };

export default function CategoryRules() {
  const { theme } = useTheme();
  const router = useRouter();
  const [rules, setRules] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [r, cats, t] = await Promise.all([api.get("/category-rules"), api.get("/categories"), api.get("/tags")]);
    setRules(r);
    setCategories(cats);
    setTags(t);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const tagName = (id: string) => tags.find((t) => t.id === id)?.name || "";

  const openNew = () => setEdit({ ...BLANK_EDIT });
  const openEdit = (rule: any) =>
    setEdit({ id: rule.id, keyword: rule.keyword, category: rule.category, type: rule.category_type, tagIds: rule.tag_ids || [] });

  const toggleEditTag = (tagId: string) => {
    setEdit((e) => {
      if (!e) return e;
      const next = e.tagIds.includes(tagId) ? e.tagIds.filter((x) => x !== tagId) : [...e.tagIds, tagId];
      return { ...e, tagIds: next };
    });
  };

  const save = async () => {
    if (!edit) return;
    const keyword = edit.keyword.trim();
    const category = edit.category.trim();
    if (!keyword || !category) {
      Alert.alert("Missing info", "Keyword and category are required.");
      return;
    }
    setSaving(true);
    try {
      if (edit.id) {
        await api.put(`/category-rules/${edit.id}`, { keyword, category, category_type: edit.type, tag_ids: edit.tagIds });
      } else {
        await api.post("/category-rules", { keyword, category, category_type: edit.type, tag_ids: edit.tagIds });
      }
      setEdit(null);
      load();
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to save rule");
    } finally {
      setSaving(false);
    }
  };

  const remove = (id: string) => {
    const doDelete = async () => {
      try {
        await api.del(`/category-rules/${id}`);
        load();
      } catch (error) {
        Alert.alert("Delete failed", error instanceof Error ? error.message : "Failed to delete rule");
      }
    };

    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      const ok = window.confirm("Delete rule? Existing transactions keep their current category/tags.");
      if (ok) void doDelete();
      return;
    }

    Alert.alert("Delete rule?", "Existing transactions keep their current category/tags.", [
      { text: "Cancel" },
      { text: "Delete", style: "destructive", onPress: () => { void doDelete(); } },
    ]);
  };

  const categoryOptions = edit ? categories.filter((c) => c.type === edit.type) : [];

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(app)/more");
  };

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <TouchableOpacity testID="close-category-rules" onPress={close} hitSlop={12}><Ionicons name="close" size={24} color={theme.text} /></TouchableOpacity>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Auto-categorize Rules</Text>
        <TouchableOpacity testID="add-rule-btn" onPress={openNew}><Text style={{ color: theme.text, fontWeight: "700" }}>+ Add</Text></TouchableOpacity>
      </View>

      <Text style={{ color: theme.textMuted, paddingHorizontal: 24, fontSize: 13 }}>
        When a transaction's note contains a rule's keyword, its category and tags are applied automatically during statement import.
      </Text>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 80 }}>
        {rules.map((r) => (
          <TouchableOpacity key={r.id} testID={`rule-row-${r.id}`} onPress={() => openEdit(r)} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: "700" }}>{r.keyword}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                <View style={[styles.metaChip, { backgroundColor: r.category_type === "income" ? theme.positive : theme.negative, borderColor: r.category_type === "income" ? theme.positive : theme.negative }]}>
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{r.category} ({r.category_type})</Text>
                </View>
                {(r.tag_ids || []).map((tagId: string) => (
                  tagName(tagId) ? (
                    <View key={tagId} style={[styles.metaChip, { borderColor: theme.border }]}>
                      <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: "600" }}>{tagName(tagId)}</Text>
                    </View>
                  ) : null
                ))}
              </View>
            </View>
            <TouchableOpacity testID={`rule-edit-${r.id}`} onPress={() => openEdit(r)} style={{ padding: 8 }}>
              <Ionicons name="create-outline" size={20} color={theme.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity testID={`rule-del-${r.id}`} onPress={() => remove(r.id)} style={{ padding: 8 }}>
              <Ionicons name="trash-outline" size={20} color={theme.negative} />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
        {rules.length === 0 && <Text style={{ color: theme.textMuted, textAlign: "center", marginTop: 40 }}>No rules yet.</Text>}
      </ScrollView>

      <Modal transparent visible={!!edit} animationType="slide" onRequestClose={() => setEdit(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setEdit(null)} style={styles.backdrop}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>{edit?.id ? "Edit rule" : "New rule"}</Text>

              <ScrollView keyboardShouldPersistTaps="handled" style={{ marginTop: 12 }}>
                <Text style={[styles.label, { color: theme.textMuted }]}>KEYWORD</Text>
                <TextInput
                  testID="rule-keyword-input"
                  value={edit?.keyword || ""}
                  onChangeText={(v) => setEdit((e) => (e ? { ...e, keyword: v } : e))}
                  placeholder="e.g. Zomato"
                  placeholderTextColor={theme.textMuted}
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                />
                <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 6 }}>
                  Separate with commas to require all of them, e.g. "Mohit, 77981"
                </Text>

                <Text style={[styles.label, { color: theme.textMuted }]}>TYPE</Text>
                <View style={styles.chipRow}>
                  {(["expense", "income"] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      testID={`rule-type-${t}`}
                      onPress={() => setEdit((e) => (e ? { ...e, type: t, category: "" } : e))}
                      style={[styles.chip, { backgroundColor: edit?.type === t ? theme.primary : theme.background, borderColor: edit?.type === t ? theme.primary : theme.border }]}
                    >
                      <Text style={{ color: edit?.type === t ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12, textTransform: "capitalize" }}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.label, { color: theme.textMuted }]}>CATEGORY</Text>
                <View style={styles.chipRow}>
                  {categoryOptions.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      testID={`rule-cat-${c.name}`}
                      onPress={() => setEdit((e) => (e ? { ...e, category: c.name } : e))}
                      style={[styles.chip, { backgroundColor: edit?.category === c.name ? theme.primary : theme.background, borderColor: edit?.category === c.name ? theme.primary : theme.border }]}
                    >
                      <Text style={{ color: edit?.category === c.name ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12 }}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                  {categoryOptions.length === 0 && <Text style={{ color: theme.textMuted, fontSize: 12 }}>No {edit?.type} categories yet.</Text>}
                </View>

                <Text style={[styles.label, { color: theme.textMuted }]}>TAGS</Text>
                <View style={styles.chipRow}>
                  {tags.map((t) => {
                    const active = !!edit?.tagIds.includes(t.id);
                    return (
                      <TouchableOpacity
                        key={t.id}
                        testID={`rule-tag-${t.id}`}
                        onPress={() => toggleEditTag(t.id)}
                        style={[styles.chip, { backgroundColor: active ? theme.primary : theme.background, borderColor: active ? theme.primary : theme.border }]}
                      >
                        <Text style={{ color: active ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12 }}>{t.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {tags.length === 0 && <Text style={{ color: theme.textMuted, fontSize: 12 }}>No tags yet.</Text>}
                </View>
              </ScrollView>

              <TouchableOpacity testID="rule-save-btn" onPress={save} disabled={saving} style={[styles.submitBtn, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}>
                <Text style={{ color: theme.primaryText, fontWeight: "700" }}>{saving ? "Saving..." : "Save"}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 20 },
  row: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 8 },
  metaChip: { paddingHorizontal: 8, height: 20, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1, maxHeight: "85%" },
  label: { fontSize: 11, letterSpacing: 2, fontWeight: "700", marginTop: 16, marginBottom: 8, color: "#888" },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, minHeight: 52 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  submitBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 999, alignItems: "center" },
});
