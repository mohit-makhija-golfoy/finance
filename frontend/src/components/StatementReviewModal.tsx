import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Modal, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/contexts/ThemeContext";
import Checkbox from "@/src/components/Checkbox";
import { inr } from "@/src/constants/theme";
import { guessKeyword, notesMatchKeyword, extractKeywords } from "@/src/utils/categoryRules";
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
  const insets = useSafeAreaInsets();
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
  const [groupByCategory, setGroupByCategory] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [autoArrange, setAutoArrange] = useState(false);
  const [expandedSuggestions, setExpandedSuggestions] = useState<Record<string, boolean>>({});
  const [approvingGroup, setApprovingGroup] = useState<{ keyword: string; entries: StatementEntry[] } | null>(null);
  const [approveCategory, setApproveCategory] = useState("");
  const [approveTagIds, setApproveTagIds] = useState<string[]>([]);
  const [approveNote, setApproveNote] = useState("");
  const [approveNewCategoryName, setApproveNewCategoryName] = useState("");
  const [approveNewTagName, setApproveNewTagName] = useState("");
  const [approveSavingCategory, setApproveSavingCategory] = useState(false);
  const [approveSavingTag, setApproveSavingTag] = useState(false);
  const [approving, setApproving] = useState(false);

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
      setGroupByCategory(true);
      setAutoArrange(false);
      setExpandedSuggestions({});
      setApprovingGroup(null);
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
  const toggleGroup = (groupEntries: StatementEntry[], nextValue: boolean) =>
    setChecked((c) => {
      const next = { ...c };
      for (const e of groupEntries) next[e.id] = nextValue;
      return next;
    });

  const sumByDirection = (list: StatementEntry[]) =>
    list.reduce(
      (totals, e) => {
        if (e.direction === "credit") totals.credit += e.amount;
        else totals.debit += e.amount;
        return totals;
      },
      { credit: 0, debit: 0 }
    );

  const totalAmounts = useMemo(() => sumByDirection(entries), [entries]);
  const selectedAmounts = useMemo(() => sumByDirection(entries.filter((e) => checked[e.id])), [entries, checked]);

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

  const ungroupedEntries = useMemo(
    () => entries.filter((e) => (entryCategory[e.id] || defaultCategory) === defaultCategory),
    [entries, entryCategory, defaultCategory]
  );

  // "Auto arrange" suggestions: every distinct merchant/rail keyword found in
  // the still-ungrouped entries becomes its own suggested group, containing
  // every entry whose note mentions that keyword — so a single entry can
  // appear under multiple suggestions (e.g. both "Paytm" and "Payment").
  const suggestedGroups = useMemo(() => {
    if (!autoArrange) return [];
    const buckets = new Map<string, StatementEntry[]>();
    const display = new Map<string, string>();
    for (const entry of ungroupedEntries) {
      const notes = `${bankName || "Bank"} • ${entry.description}`;
      for (const kw of extractKeywords(notes)) {
        const lower = kw.toLowerCase();
        if (!buckets.has(lower)) {
          buckets.set(lower, []);
          display.set(lower, kw);
        }
        buckets.get(lower)!.push(entry);
      }
    }
    return Array.from(buckets.entries())
      .map(([lower, list]) => ({ keyword: display.get(lower)!, entries: list }))
      .sort((a, b) => a.keyword.localeCompare(b.keyword));
  }, [autoArrange, ungroupedEntries, bankName]);

  const toggleSuggestionExpanded = (keyword: string) =>
    setExpandedSuggestions((s) => ({ ...s, [keyword]: !s[keyword] }));

  const approveType: "income" | "expense" = useMemo(() => {
    if (!approvingGroup) return "expense";
    const creditCount = approvingGroup.entries.filter((e) => e.direction === "credit").length;
    return creditCount * 2 >= approvingGroup.entries.length ? "income" : "expense";
  }, [approvingGroup]);
  const approveCategoryOptions = categories.filter((c) => c.type === approveType);
  const approveSums = approvingGroup ? sumByDirection(approvingGroup.entries) : { credit: 0, debit: 0 };

  const openApproveGroup = (group: { keyword: string; entries: StatementEntry[] }) => {
    setApprovingGroup(group);
    setApproveCategory("");
    setApproveTagIds(defaultTagIds);
    setApproveNote(group.keyword);
    setApproveNewCategoryName("");
    setApproveNewTagName("");
  };

  const toggleApproveTag = (tagId: string) =>
    setApproveTagIds((ids) => (ids.includes(tagId) ? ids.filter((x) => x !== tagId) : [...ids, tagId]));

  const addApproveCategory = async () => {
    const name = approveNewCategoryName.trim();
    if (!name) return;
    setApproveSavingCategory(true);
    try {
      const created = await onCreateCategory(name, approveType);
      setApproveCategory(created.name);
      setApproveNewCategoryName("");
    } catch (e) {
      // Non-fatal: the category chip list simply won't gain the new entry if creation failed.
    } finally {
      setApproveSavingCategory(false);
    }
  };

  const addApproveTag = async () => {
    const name = approveNewTagName.trim();
    if (!name) return;
    setApproveSavingTag(true);
    try {
      const created = await onCreateTag(name);
      setApproveTagIds((ids) => (ids.includes(created.id) ? ids : [...ids, created.id]));
      setApproveNewTagName("");
    } catch (e) {
      // Non-fatal: the tag simply won't appear if creation failed.
    } finally {
      setApproveSavingTag(false);
    }
  };

  const confirmApproveGroup = async () => {
    if (!approvingGroup || !approveCategory) return;
    setApproving(true);
    try {
      const ids = approvingGroup.entries.map((e) => e.id);
      setEntryCategory((c) => {
        const next = { ...c };
        for (const id of ids) next[id] = approveCategory;
        return next;
      });
      setEntryTagIds((c) => {
        const next = { ...c };
        for (const id of ids) next[id] = approveTagIds;
        return next;
      });
      const keyword = approveNote.trim();
      if (keyword) {
        try {
          await onApplyRuleToAll(keyword, approveCategory, approveType, approveTagIds);
        } catch {
          // Non-fatal: the entries are already grouped locally either way.
        }
      }
    } finally {
      setApproving(false);
      setApprovingGroup(null);
    }
  };

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
      <SafeAreaView edges={["bottom"]} style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top + 20 }]}>
          <TouchableOpacity
            testID="statement-review-close"
            onPress={onClose}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          >
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Review Entries</Text>
          <View style={{ width: 24 }} />
        </View>

        <Text style={{ color: theme.textMuted, paddingHorizontal: 24, fontSize: 13 }}>
          {bankName ? `${bankName} • ` : ""}
          {entries.length} entr{entries.length === 1 ? "y" : "ies"} found
          {totalAmounts.credit > 0 && (
            <Text style={{ color: theme.positive }}> • +{inr(totalAmounts.credit)}</Text>
          )}
          {totalAmounts.debit > 0 && (
            <Text style={{ color: theme.negative }}> • -{inr(totalAmounts.debit)}</Text>
          )}
          . Uncheck any you don't want to import, tap one to edit its category/tags.
        </Text>

        <View style={{ paddingHorizontal: 24, marginTop: 8 }}>
          <Checkbox
            testID="statement-group-by-category"
            value={groupByCategory}
            onChange={setGroupByCategory}
            label="Group by category"
          />
          <Checkbox
            testID="statement-auto-arrange"
            value={autoArrange}
            onChange={(v) => {
              setAutoArrange(v);
              if (v) setGroupByCategory(true);
            }}
            label="Auto arrange (suggest groups for ungrouped)"
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
              const allChecked = group.entries.every((e) => checked[e.id]);
              return (
                <View key={group.category} style={{ marginBottom: 10 }}>
                  <TouchableOpacity
                    testID={`statement-group-${group.category}`}
                    onPress={() => toggleGroupCollapsed(group.category)}
                    activeOpacity={0.7}
                    style={[styles.groupHeader, { backgroundColor: theme.surface, borderColor: isUngrouped ? theme.negative : theme.border }]}
                  >
                    <Checkbox
                      testID={`statement-group-select-${group.category}`}
                      value={allChecked}
                      onChange={(v) => toggleGroup(group.entries, v)}
                      label=""
                    />
                    <Ionicons name={expanded ? "chevron-down" : "chevron-forward"} size={16} color={theme.textMuted} style={{ marginLeft: 4 }} />
                    <Text style={{ color: isUngrouped ? theme.negative : theme.text, fontSize: 14, fontWeight: "700", flex: 1, marginLeft: 8 }}>
                      {isUngrouped ? "Ungrouped — needs category/tags" : group.category}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "600" }}>
                      {group.entries.length} entr{group.entries.length === 1 ? "y" : "ies"} •{" "}
                      <Text style={{ color: sumByDirection(group.entries).credit >= sumByDirection(group.entries).debit ? theme.positive : theme.negative }}>
                        {inr(sumByDirection(group.entries).credit - sumByDirection(group.entries).debit)}
                      </Text>
                    </Text>
                  </TouchableOpacity>
                  {expanded && (
                    <View style={{ marginTop: 8 }}>
                      {isUngrouped && autoArrange ? (
                        suggestedGroups.length > 0 ? (
                          suggestedGroups.map((sg) => {
                            const sgExpanded = !!expandedSuggestions[sg.keyword];
                            const sgSums = sumByDirection(sg.entries);
                            return (
                              <View key={sg.keyword} style={{ marginBottom: 8 }}>
                                <View style={[styles.suggestionHeader, { backgroundColor: theme.primary + "22", borderColor: theme.primary }]}>
                                  <TouchableOpacity
                                    testID={`statement-suggestion-${sg.keyword}`}
                                    onPress={() => toggleSuggestionExpanded(sg.keyword)}
                                    activeOpacity={0.7}
                                    style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
                                  >
                                    <Ionicons name={sgExpanded ? "chevron-down" : "chevron-forward"} size={14} color={theme.primary} />
                                    <Text style={{ color: theme.primary, fontWeight: "700", fontSize: 13, marginLeft: 6 }}>{sg.keyword}</Text>
                                    <Text style={{ color: theme.textMuted, fontSize: 11, marginLeft: 8 }}>
                                      {sg.entries.length} entr{sg.entries.length === 1 ? "y" : "ies"} •{" "}
                                      {inr(sgSums.credit - sgSums.debit)}
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    testID={`statement-suggestion-approve-${sg.keyword}`}
                                    onPress={() => openApproveGroup(sg)}
                                    style={[styles.approveBtn, { backgroundColor: theme.primary }]}
                                  >
                                    <Text style={{ color: theme.primaryText, fontSize: 11, fontWeight: "700" }}>Approve</Text>
                                  </TouchableOpacity>
                                </View>
                                {sgExpanded && <View style={{ marginTop: 6 }}>{sg.entries.map((entry) => renderEntryRow(entry))}</View>}
                              </View>
                            );
                          })
                        ) : (
                          <Text style={{ color: theme.textMuted, fontSize: 12, padding: 8 }}>No suggestions found.</Text>
                        )
                      ) : (
                        group.entries.map((entry) => renderEntryRow(entry))
                      )}
                    </View>
                  )}
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
            {selectedAmounts.credit > 0 && (
              <Text style={{ color: theme.positive }}> • +{inr(selectedAmounts.credit)}</Text>
            )}
            {selectedAmounts.debit > 0 && (
              <Text style={{ color: theme.negative }}> • -{inr(selectedAmounts.debit)}</Text>
            )}
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
      </SafeAreaView>

      <Modal transparent visible={!!editingEntry} animationType="slide" onRequestClose={() => setEditingEntryId(null)}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setEditingEntryId(null)}
          style={
            Platform.OS === "web"
              ? styles.backdrop
              : [styles.backdrop, { position: "absolute", top: -insets.top, left: 0, right: 0, bottom: 0 }]
          }
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: 20 + insets.bottom }]}>
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
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      <Modal transparent visible={!!approvingGroup} animationType="slide" onRequestClose={() => setApprovingGroup(null)}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setApprovingGroup(null)}
          style={
            Platform.OS === "web"
              ? styles.backdrop
              : [styles.backdrop, { position: "absolute", top: -insets.top, left: 0, right: 0, bottom: 0 }]
          }
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: 20 + insets.bottom }]}>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Approve suggestion</Text>
            {approvingGroup && (
              <Text style={{ color: theme.textMuted, marginTop: 4, fontSize: 12 }}>
                {approvingGroup.entries.length} entr{approvingGroup.entries.length === 1 ? "y" : "ies"} •{" "}
                {inr(approveSums.credit - approveSums.debit)}
              </Text>
            )}

            <ScrollView keyboardShouldPersistTaps="handled" style={{ marginTop: 16 }}>
              <Text style={labelStyle(theme)}>CATEGORY</Text>
              <View style={styles.chipRow}>
                {approveCategoryOptions.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    testID={`statement-approve-cat-${c.name}`}
                    onPress={() => setApproveCategory(c.name)}
                    style={[styles.chip, { backgroundColor: approveCategory === c.name ? theme.primary : theme.background, borderColor: approveCategory === c.name ? theme.primary : theme.border }]}
                  >
                    <Text style={{ color: approveCategory === c.name ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12 }}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.addRow}>
                <TextInput
                  testID="statement-approve-new-category"
                  value={approveNewCategoryName}
                  onChangeText={setApproveNewCategoryName}
                  onSubmitEditing={addApproveCategory}
                  placeholder="New category name"
                  placeholderTextColor={theme.textMuted}
                  style={[styles.addInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                />
                <TouchableOpacity
                  testID="statement-approve-add-category"
                  onPress={addApproveCategory}
                  disabled={approveSavingCategory || !approveNewCategoryName.trim()}
                  style={[styles.addBtn, { backgroundColor: theme.primary, opacity: approveSavingCategory || !approveNewCategoryName.trim() ? 0.5 : 1 }]}
                >
                  <Text style={{ color: theme.primaryText, fontWeight: "700" }}>Add</Text>
                </TouchableOpacity>
              </View>

              <Text style={labelStyle(theme)}>TAGS</Text>
              <View style={styles.chipRow}>
                {tags.map((t) => {
                  const active = approveTagIds.includes(t.id);
                  return (
                    <TouchableOpacity
                      key={t.id}
                      testID={`statement-approve-tag-${t.id}`}
                      onPress={() => toggleApproveTag(t.id)}
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
                  testID="statement-approve-new-tag"
                  value={approveNewTagName}
                  onChangeText={setApproveNewTagName}
                  onSubmitEditing={addApproveTag}
                  placeholder="New tag name"
                  placeholderTextColor={theme.textMuted}
                  style={[styles.addInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                />
                <TouchableOpacity
                  testID="statement-approve-add-tag"
                  onPress={addApproveTag}
                  disabled={approveSavingTag || !approveNewTagName.trim()}
                  style={[styles.addBtn, { backgroundColor: theme.primary, opacity: approveSavingTag || !approveNewTagName.trim() ? 0.5 : 1 }]}
                >
                  <Text style={{ color: theme.primaryText, fontWeight: "700" }}>Add</Text>
                </TouchableOpacity>
              </View>

              <Text style={labelStyle(theme)}>NOTE</Text>
              <TextInput
                testID="statement-approve-note"
                value={approveNote}
                onChangeText={setApproveNote}
                placeholder="Match keyword (e.g. Zomato)"
                placeholderTextColor={theme.textMuted}
                style={[styles.noteInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              />
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 6 }}>
                Applied to every entry matching "{approvingGroup?.keyword}" and saved as a rule for future imports.
              </Text>
            </ScrollView>

            <TouchableOpacity
              testID="statement-approve-done"
              onPress={confirmApproveGroup}
              disabled={approving || !approveCategory}
              style={[styles.submitBtn, { backgroundColor: theme.primary, marginTop: 16, opacity: approving || !approveCategory ? 0.6 : 1 }]}
            >
              <Text style={{ color: theme.primaryText, fontWeight: "700" }}>{approving ? "Approving..." : "Approve & Add"}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
          </KeyboardAvoidingView>
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
  suggestionHeader: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderStyle: "dashed" },
  approveBtn: { paddingHorizontal: 10, height: 26, borderRadius: 999, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  metaChip: { paddingHorizontal: 8, height: 20, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  footer: { padding: 20, borderTopWidth: 1 },
  submitBtn: { paddingVertical: 14, borderRadius: 999, alignItems: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1, maxHeight: "80%" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  addRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  addInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 40, fontSize: 13 },
  noteInput: { width: "100%", borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, minHeight: 52 },
  addBtn: { paddingHorizontal: 16, justifyContent: "center", borderRadius: 12 },
});
