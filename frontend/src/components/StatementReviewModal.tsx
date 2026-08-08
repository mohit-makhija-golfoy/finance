import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/contexts/ThemeContext";
import Checkbox from "@/src/components/Checkbox";
import { inr } from "@/src/constants/theme";
import { guessKeyword, notesMatchKeyword } from "@/src/utils/categoryRules";
import type { StatementEntry } from "@/src/types/statement";

export type StatementEntryWithChoices = StatementEntry & { category: string; tagIds: string[] };

type Props = {
  visible: boolean;
  entries: StatementEntry[];
  bankName: string;
  warnings: string[];
  categories: any[];
  tags: any[];
  defaultCategory: string;
  defaultTagIds: string[];
  entryDefaults?: Record<string, { category: string; tagIds: string[] }>;
  onClose: () => void;
  onConfirm: (selected: StatementEntryWithChoices[]) => void | Promise<void>;
  onCreateCategory: (name: string, type: "income" | "expense") => Promise<{ id: string; name: string }>;
  onCreateTag: (name: string) => Promise<{ id: string; name: string }>;
  onApplyRuleToAll: (keyword: string, category: string, categoryType: "income" | "expense", tagIds: string[]) => Promise<void>;
  submitting?: boolean;
};

export default function StatementReviewModal({
  visible,
  entries,
  bankName,
  warnings,
  categories,
  tags,
  defaultCategory,
  defaultTagIds,
  entryDefaults,
  onClose,
  onConfirm,
  onCreateCategory,
  onCreateTag,
  onApplyRuleToAll,
  submitting,
}: Props) {
  const { theme } = useTheme();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [entryCategory, setEntryCategory] = useState<Record<string, string>>({});
  const [entryTagIds, setEntryTagIds] = useState<Record<string, string[]>>({});
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingTag, setSavingTag] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);
  const [applyKeyword, setApplyKeyword] = useState("");
  const [applyingRule, setApplyingRule] = useState(false);
  const [hasEdited, setHasEdited] = useState(false);
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (visible) {
      const nextChecked: Record<string, boolean> = {};
      const nextCategory: Record<string, string> = {};
      const nextTagIds: Record<string, string[]> = {};
      for (const e of entries) {
        const preset = entryDefaults?.[e.id];
        nextChecked[e.id] = true;
        nextCategory[e.id] = preset?.category || defaultCategory;
        nextTagIds[e.id] = preset?.tagIds || defaultTagIds;
      }
      setChecked(nextChecked);
      setEntryCategory(nextCategory);
      setEntryTagIds(nextTagIds);
      setEditingEntryId(null);
    }
  }, [visible, entries, defaultCategory, defaultTagIds, entryDefaults]);

  useEffect(() => {
    setNewCategoryName("");
    setNewTagName("");
    setHasEdited(false);
    const entry = entries.find((e) => e.id === editingEntryId);
    const notes = entry ? `${bankName || "Bank"} • ${entry.description}` : "";
    setApplyToAll(true);
    setApplyKeyword(guessKeyword(notes));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingEntryId]);

  const selectedCount = Object.values(checked).filter(Boolean).length;
  const toggle = (id: string) => setChecked((c) => ({ ...c, [id]: !c[id] }));

  const setCategoryFor = (id: string, name: string) => {
    setHasEdited(true);
    setEntryCategory((c) => ({ ...c, [id]: name }));
  };
  const toggleTagFor = (id: string, tagId: string) => {
    setHasEdited(true);
    setEntryTagIds((c) => {
      const current = c[id] || [];
      const next = current.includes(tagId) ? current.filter((x) => x !== tagId) : [...current, tagId];
      return { ...c, [id]: next };
    });
  };

  const confirm = () => {
    const selected: StatementEntryWithChoices[] = entries
      .filter((e) => checked[e.id])
      .map((e) => ({ ...e, category: entryCategory[e.id] || defaultCategory, tagIds: entryTagIds[e.id] || defaultTagIds }));
    onConfirm(selected);
  };

  const groupedEntries = useMemo(() => {
    const groups: Record<string, StatementEntry[]> = {};
    for (const entry of entries) {
      const cat = entryCategory[entry.id] || defaultCategory;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(entry);
    }
    return Object.entries(groups)
      .map(([category, groupEntries]) => ({ category, entries: groupEntries }))
      .sort((a, b) => {
        if (a.category === defaultCategory) return -1;
        if (b.category === defaultCategory) return 1;
        return a.category.localeCompare(b.category);
      });
  }, [entries, entryCategory, defaultCategory]);

  const isGroupExpanded = (collapsed: Record<string, boolean>, category: string) =>
    category in collapsed ? !collapsed[category] : category === defaultCategory;

  const toggleGroupCollapsed = (category: string) =>
    setCollapsedGroups((c) => ({ ...c, [category]: isGroupExpanded(c, category) }));

  const editingEntry = entries.find((e) => e.id === editingEntryId) || null;
  const editingType = editingEntry?.direction === "credit" ? "income" : "expense";
  const categoryOptions = categories.filter((c) => c.type === editingType);
  const editingNotes = editingEntry ? `${bankName || "Bank"} • ${editingEntry.description}` : "";

  const toggleApplyToAll = (value: boolean) => {
    setApplyToAll(value);
    if (value && !applyKeyword) setApplyKeyword(guessKeyword(editingNotes));
  };

  const closeEdit = async () => {
    // Only commit a rule if the user actually changed the category/tags in
    // this sheet — otherwise merely opening and closing an entry (e.g. to
    // look at it) would silently create/overwrite a rule for its vendor
    // keyword with whatever category happened to be showing, which can leak
    // an unrelated category's tags onto the opposite transaction type.
    if (applyToAll && hasEdited && applyKeyword.trim() && editingEntry) {
      const keyword = applyKeyword.trim();
      const category = entryCategory[editingEntry.id] || defaultCategory;
      const tagIds = entryTagIds[editingEntry.id] || defaultTagIds;

      setApplyingRule(true);
      try {
        await onApplyRuleToAll(keyword, category, editingType, tagIds);
      } catch {
        // Non-fatal: the per-entry category/tags are already applied locally either way.
      } finally {
        setApplyingRule(false);
      }

      // Also apply to every other entry in this same review batch whose note
      // matches the keyword, so a single "apply to all" covers the statement
      // currently being reviewed, not just future imports.
      const matchingIds = entries
        .filter((e) => e.direction === editingEntry.direction)
        .filter((e) => notesMatchKeyword(`${bankName || "Bank"} • ${e.description}`, keyword))
        .map((e) => e.id);

      if (matchingIds.length) {
        setEntryCategory((c) => {
          const next = { ...c };
          for (const id of matchingIds) next[id] = category;
          return next;
        });
        setEntryTagIds((c) => {
          const next = { ...c };
          for (const id of matchingIds) next[id] = tagIds;
          return next;
        });
      }
    }
    setEditingEntryId(null);
  };

  const addCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || !editingEntry) return;
    setSavingCategory(true);
    try {
      const created = await onCreateCategory(name, editingType);
      setCategoryFor(editingEntry.id, created.name);
      setNewCategoryName("");
    } catch (e) {
      // Surfacing a full error dialog here would block the sheet; the category
      // chip list simply won't gain the new entry if creation failed.
    } finally {
      setSavingCategory(false);
    }
  };

  const addTag = async () => {
    const name = newTagName.trim();
    if (!name || !editingEntry) return;
    setSavingTag(true);
    try {
      const created = await onCreateTag(name);
      const entryId = editingEntry.id;
      setEntryTagIds((c) => {
        const current = c[entryId] || [];
        return current.includes(created.id) ? c : { ...c, [entryId]: [...current, created.id] };
      });
      setNewTagName("");
    } catch (e) {
      // Same as above — the tag simply won't appear if creation failed.
    } finally {
      setSavingTag(false);
    }
  };

  const renderEntryRow = (entry: StatementEntry) => {
    const entryTagNames = (entryTagIds[entry.id] || []).map((id) => tags.find((t) => t.id === id)?.name).filter(Boolean);
    return (
      <TouchableOpacity
        key={entry.id}
        testID={`statement-entry-${entry.id}`}
        onPress={() => setEditingEntryId(entry.id)}
        activeOpacity={0.7}
        style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <Checkbox value={!!checked[entry.id]} onChange={() => toggle(entry.id)} label="" />
        <View style={{ flex: 1, marginLeft: 4 }}>
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }} numberOfLines={2}>
            {entry.description}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>{entry.date}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            <View style={[styles.metaChip, { backgroundColor: entry.direction === "credit" ? theme.positive : theme.negative, borderColor: entry.direction === "credit" ? theme.positive : theme.negative }]}>
              <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{entryCategory[entry.id] || defaultCategory}</Text>
            </View>
            {entryTagNames.map((name) => (
              <View key={name} style={[styles.metaChip, { borderColor: theme.border }]}>
                <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: "600" }}>{name}</Text>
              </View>
            ))}
            <Ionicons name="pencil-outline" size={12} color={theme.textMuted} />
          </View>
        </View>
        <Text style={{ color: entry.direction === "credit" ? theme.positive : theme.text, fontWeight: "700", fontSize: 14 }}>
          {entry.direction === "credit" ? "+" : "-"}{inr(entry.amount)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal transparent={false} visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.topBar}>
          <TouchableOpacity testID="statement-review-close" onPress={onClose}>
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Review Entries</Text>
          <View style={{ width: 24 }} />
        </View>

        <Text style={{ color: theme.textMuted, paddingHorizontal: 24, fontSize: 13 }}>
          {bankName ? `${bankName} • ` : ""}
          {entries.length} entr{entries.length === 1 ? "y" : "ies"} found. Uncheck any you don't want to import, tap one to edit its category/tags.
        </Text>

        <View style={{ paddingHorizontal: 24, marginTop: 8 }}>
          <Checkbox
            testID="statement-group-by-category"
            value={groupByCategory}
            onChange={setGroupByCategory}
            label="Group by category"
          />
        </View>

        {warnings.length > 0 && (
          <View style={[styles.warningBox, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            {warnings.map((w, i) => (
              <Text key={i} style={{ color: theme.textMuted, fontSize: 12 }}>{w}</Text>
            ))}
          </View>
        )}

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingTop: 12, paddingBottom: 24 }}>
          {groupByCategory ? (
            groupedEntries.map((group) => {
              const isUngrouped = group.category === defaultCategory;
              const expanded = isGroupExpanded(collapsedGroups, group.category);
              return (
                <View key={group.category} style={{ marginBottom: 10 }}>
                  <TouchableOpacity
                    testID={`statement-group-${group.category}`}
                    onPress={() => toggleGroupCollapsed(group.category)}
                    activeOpacity={0.7}
                    style={[styles.groupHeader, { backgroundColor: theme.surface, borderColor: isUngrouped ? theme.negative : theme.border }]}
                  >
                    <Ionicons name={expanded ? "chevron-down" : "chevron-forward"} size={16} color={theme.textMuted} />
                    <Text style={{ color: isUngrouped ? theme.negative : theme.text, fontSize: 14, fontWeight: "700", flex: 1, marginLeft: 8 }}>
                      {isUngrouped ? "Ungrouped — needs category/tags" : group.category}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "600" }}>
                      {group.entries.length}
                    </Text>
                  </TouchableOpacity>
                  {expanded && <View style={{ marginTop: 8 }}>{group.entries.map((entry) => renderEntryRow(entry))}</View>}
                </View>
              );
            })
          ) : (
            entries.map((entry) => renderEntryRow(entry))
          )}
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
          <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 10 }}>
            {selectedCount} of {entries.length} selected
          </Text>
          <TouchableOpacity
            testID="statement-review-submit"
            onPress={confirm}
            disabled={selectedCount === 0 || submitting}
            style={[styles.submitBtn, { backgroundColor: theme.primary, opacity: selectedCount === 0 || submitting ? 0.5 : 1 }]}
          >
            <Text style={{ color: theme.primaryText, fontWeight: "700" }}>
              {submitting ? "Importing..." : `Import ${selectedCount} entr${selectedCount === 1 ? "y" : "ies"}`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal transparent visible={!!editingEntry} animationType="slide" onRequestClose={() => setEditingEntryId(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setEditingEntryId(null)} style={styles.backdrop}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Edit entry</Text>
            {editingEntry && (
              <Text style={{ color: theme.textMuted, marginTop: 4, fontSize: 12 }} numberOfLines={2}>{editingEntry.description}</Text>
            )}

            <ScrollView keyboardShouldPersistTaps="handled" style={{ marginTop: 16 }}>
              <Text style={labelStyle(theme)}>CATEGORY</Text>
              <View style={styles.chipRow}>
                {categoryOptions.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    testID={`statement-entry-cat-${c.name}`}
                    onPress={() => editingEntry && setCategoryFor(editingEntry.id, c.name)}
                    style={[styles.chip, { backgroundColor: editingEntry && entryCategory[editingEntry.id] === c.name ? theme.primary : theme.background, borderColor: editingEntry && entryCategory[editingEntry.id] === c.name ? theme.primary : theme.border }]}
                  >
                    <Text style={{ color: editingEntry && entryCategory[editingEntry.id] === c.name ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12 }}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.addRow}>
                <TextInput
                  testID="statement-entry-new-category"
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                  onSubmitEditing={addCategory}
                  placeholder="New category name"
                  placeholderTextColor={theme.textMuted}
                  style={[styles.addInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                />
                <TouchableOpacity
                  testID="statement-entry-add-category"
                  onPress={addCategory}
                  disabled={savingCategory || !newCategoryName.trim()}
                  style={[styles.addBtn, { backgroundColor: theme.primary, opacity: savingCategory || !newCategoryName.trim() ? 0.5 : 1 }]}
                >
                  <Text style={{ color: theme.primaryText, fontWeight: "700" }}>Add</Text>
                </TouchableOpacity>
              </View>

              <Text style={labelStyle(theme)}>TAGS</Text>
              <View style={styles.chipRow}>
                {tags.map((t) => {
                  const active = !!editingEntry && (entryTagIds[editingEntry.id] || []).includes(t.id);
                  return (
                    <TouchableOpacity
                      key={t.id}
                      testID={`statement-entry-tag-${t.id}`}
                      onPress={() => editingEntry && toggleTagFor(editingEntry.id, t.id)}
                      style={[styles.chip, { backgroundColor: active ? theme.primary : theme.background, borderColor: active ? theme.primary : theme.border }]}
                    >
                      <Text style={{ color: active ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12 }}>{t.name}</Text>
                    </TouchableOpacity>
                  );
                })}
                {tags.length === 0 && <Text style={{ color: theme.textMuted, fontSize: 12 }}>No tags yet.</Text>}
              </View>
              <View style={styles.addRow}>
                <TextInput
                  testID="statement-entry-new-tag"
                  value={newTagName}
                  onChangeText={setNewTagName}
                  onSubmitEditing={addTag}
                  placeholder="New tag name"
                  placeholderTextColor={theme.textMuted}
                  style={[styles.addInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                />
                <TouchableOpacity
                  testID="statement-entry-add-tag"
                  onPress={addTag}
                  disabled={savingTag || !newTagName.trim()}
                  style={[styles.addBtn, { backgroundColor: theme.primary, opacity: savingTag || !newTagName.trim() ? 0.5 : 1 }]}
                >
                  <Text style={{ color: theme.primaryText, fontWeight: "700" }}>Add</Text>
                </TouchableOpacity>
              </View>

              <View style={{ marginTop: 16 }}>
                <Checkbox
                  testID="statement-entry-apply-all"
                  value={applyToAll}
                  onChange={toggleApplyToAll}
                  label="Apply to all transactions with a similar note"
                />
                {applyToAll && (
                  <>
                    <TextInput
                      testID="statement-entry-apply-keyword"
                      value={applyKeyword}
                      onChangeText={setApplyKeyword}
                      placeholder="Match keyword (e.g. Zomato)"
                      placeholderTextColor={theme.textMuted}
                      style={[styles.addInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background, marginTop: 8, width: "100%" }]}
                    />
                    <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 6 }}>
                      Separate with commas to require all of them, e.g. "Mohit, 77981"
                    </Text>
                  </>
                )}
              </View>
            </ScrollView>

            <TouchableOpacity
              testID="statement-entry-edit-done"
              onPress={closeEdit}
              disabled={applyingRule}
              style={[styles.submitBtn, { backgroundColor: theme.primary, marginTop: 16, opacity: applyingRule ? 0.6 : 1 }]}
            >
              <Text style={{ color: theme.primaryText, fontWeight: "700" }}>{applyingRule ? "Applying..." : "Done"}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
}

const labelStyle = (theme: any) => ({ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700" as const, marginBottom: 8, marginTop: 4 });

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 20 },
  warningBox: { marginHorizontal: 24, marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 10, gap: 8 },
  groupHeader: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1 },
  metaChip: { paddingHorizontal: 8, height: 20, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  footer: { padding: 20, borderTopWidth: 1 },
  submitBtn: { paddingVertical: 14, borderRadius: 999, alignItems: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1, maxHeight: "80%" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  addRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  addInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 40, fontSize: 13 },
  addBtn: { paddingHorizontal: 16, justifyContent: "center", borderRadius: 12 },
});
