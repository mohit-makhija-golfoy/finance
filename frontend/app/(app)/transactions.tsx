import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ScrollView, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/contexts/ThemeContext";
import { useFilters, type DateRangeKey } from "@/src/contexts/FilterContext";
import { api } from "@/src/api/client";
import { inr } from "@/src/constants/theme";
import Screen from "@/src/components/Screen";
import MemberChips from "@/src/components/MemberChips";
import DateField from "@/src/components/DateField";
import Checkbox from "@/src/components/Checkbox";
import FilterSection from "@/src/components/FilterSection";
import SegmentedControl from "@/src/components/SegmentedControl";
import FilterModal from "@/src/components/FilterModal";
import FilterChip from "@/src/components/FilterChip";
import { resolveCategoryIcon } from "@/src/utils/categoryIcons";
import { toLocalYMD, formatLongDate as formatDateOnly } from "@/src/utils/date";

type Range = DateRangeKey;
type SortOption = "price_asc" | "price_desc" | "date_new" | "date_old";

function parseAutoReference(note?: string | null) {
  const raw = String(note || "");
  const m = raw.match(/\[AUTO_(SIP|EMI):([^:\]]+):(\d{4}-\d{2})\]/i);
  if (!m) return null;
  const kind = m[1].toUpperCase() as "SIP" | "EMI";
  const sourceId = m[2];
  const month = m[3];
  const cleaned = raw.replace(m[0], "").trim();
  const route = kind === "SIP" ? "/investment-detail" : "/loan-detail";
  const sourceLabel = kind === "SIP" ? "investment" : "loan";
  const fallback = `Auto ${kind} payment (${month})`;
  return {
    kind,
    sourceId,
    route,
    sourceLabel,
    displayText: cleaned || fallback,
  };
}

function rangeFor(r: Range, custom?: { start: string; end: string }): { start_date?: string; end_date?: string } {
  const today = new Date();
  if (r === "all") return {};

  if (r === "custom") {
    return custom?.start && custom?.end ? { start_date: custom.start, end_date: custom.end } : {};
  }

  if (r === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start_date: toLocalYMD(start), end_date: toLocalYMD(today) };
  }

  if (r === "last") {
    const startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endDate = new Date(today.getFullYear(), today.getMonth(), 0);
    return {
      start_date: toLocalYMD(startDate),
      end_date: toLocalYMD(endDate),
    };
  }

  if (r === "year") {
    const startDate = new Date(today.getFullYear() - 1, today.getMonth(), 1);
    return { start_date: toLocalYMD(startDate), end_date: toLocalYMD(today) };
  }

  const startDate = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  return {
    start_date: toLocalYMD(startDate),
    end_date: toLocalYMD(today),
  };
}

export default function Transactions() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedCategoryNames, setSelectedCategoryNames] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
  const { range, setRange, customRange, setCustomRange } = useFilters();
  const [showFilters, setShowFilters] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("date_new");
  const [showSort, setShowSort] = useState(false);

  const onToggleGroupByCategory = (value: boolean) => {
    setGroupByCategory(value);
    // Date sorting has no meaning once entries are collapsed into category
    // groups, so fall back to the group default (highest total first).
    if (value && (sortBy === "date_new" || sortBy === "date_old")) {
      setSortBy("price_desc");
    }
  };

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (selected.length) params.set("member_ids", selected.join(","));
    if (selectedTagIds.length) params.set("tag_ids", selectedTagIds.join(","));
    if (selectedCategoryNames.length) params.set("categories", selectedCategoryNames.join(","));
    if (filter !== "all") params.set("type", filter);
    const { start_date, end_date } = rangeFor(range, customRange);
    if (start_date) params.set("start_date", start_date);
    if (end_date) params.set("end_date", end_date);
    const [m, tagList, cats, t] = await Promise.all([
      api.get("/members"),
      api.get("/tags"),
      api.get("/categories"),
      api.get(`/transactions?${params.toString()}`),
    ]);
    setMembers(m);
    setTags(tagList);
    setCategories(cats);
    setItems(t);
  }, [selected, selectedTagIds, selectedCategoryNames, filter, range, customRange]);

  const pendingReopenCategoryRef = useRef<string | null>(null);

  useFocusEffect(useCallback(() => {
    load();
    if (pendingReopenCategoryRef.current) {
      setOpenCategory(pendingReopenCategoryRef.current);
      pendingReopenCategoryRef.current = null;
    }
  }, [load]));

  const memberName = (id: string) => members.find((m) => m.id === id)?.name || "—";
  const tagName = (id: string) => tags.find((t) => t.id === id)?.name || "";

  const sortedItems = useMemo(() => {
    const copy = [...items];
    if (sortBy === "price_asc") copy.sort((a, b) => a.amount - b.amount);
    else if (sortBy === "price_desc") copy.sort((a, b) => b.amount - a.amount);
    else if (sortBy === "date_old") copy.sort((a, b) => a.date.localeCompare(b.date));
    else copy.sort((a, b) => b.date.localeCompare(a.date)); // date_new (default)
    return copy;
  }, [items, sortBy]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, { category: string; type: string; total: number; count: number; transactions: any[] }> = {};
    for (const item of items) {
      const key = `${item.type}|${item.category}`;
      if (!groups[key]) groups[key] = { category: item.category, type: item.type, total: 0, count: 0, transactions: [] };
      groups[key].total += item.amount;
      groups[key].count += 1;
      groups[key].transactions.push(item);
    }
    // Date sort options don't apply to groups; price_asc sorts ascending, everything else (including the date options) falls back to highest total first.
    const arr = Object.values(groups);
    arr.sort((a, b) => (sortBy === "price_asc" ? a.total - b.total : b.total - a.total));
    return arr;
  }, [items, sortBy]);

  const openGroup = groupedItems.find((g) => `${g.type}|${g.category}` === openCategory) || null;

  const renderTxRow = (item: any, fromGroup: boolean = false) => {
    const linked = parseAutoReference(item.notes);
    const openDetail = () => {
      if (fromGroup) {
        // The transaction detail screen is pushed on the navigation stack, but
        // this custom Modal renders as a native overlay above it regardless of
        // navigation focus — so it must be closed first, or the detail screen
        // would be stuck behind it. Remember which group was open so it can
        // reopen automatically once we're back on this screen.
        pendingReopenCategoryRef.current = openCategory;
        setOpenCategory(null);
      }
      router.push({ pathname: "/transaction-form", params: { id: item.id } });
    };
    return (
      <TouchableOpacity
        key={item.id}
        testID={`tx-row-${item.id}`}
        onLongPress={() => onDelete(item.id)}
        onPress={openDetail}
        style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
        activeOpacity={0.7}
      >
        <View style={[styles.dot, { backgroundColor: item.type === "income" ? theme.positive : theme.negative }]} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>{item.category}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>{formatDateOnly(item.date)} • {memberName(item.member_id)}</Text>
          {fromGroup && !!item.notes && (
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={2}>{item.notes}</Text>
          )}
          {!!item.tag_ids?.length && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {item.tag_ids.map((tagId: string) => (
                tagName(tagId) ? (
                  <View key={tagId} style={[styles.tagChip, { backgroundColor: theme.background, borderColor: theme.border }]}>
                    <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: "600" }}>{tagName(tagId)}</Text>
                  </View>
                ) : null
              ))}
            </View>
          )}
          {linked && (
            <>
              <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{linked.displayText}</Text>
              <TouchableOpacity
                onPress={(e: any) => {
                  e?.stopPropagation?.();
                  router.push({ pathname: linked.route as any, params: { id: linked.sourceId } });
                }}
                style={{ marginTop: 4, alignSelf: "flex-start" }}
              >
                <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "600" }}>Open linked {linked.sourceLabel}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <Text style={{ color: item.type === "income" ? theme.positive : theme.text, fontWeight: "700", fontSize: 16 }}>
            {item.type === "income" ? "+" : "-"}{inr(item.amount)}
          </Text>
          <TouchableOpacity
            testID={`delete-tx-${item.id}`}
            onPress={(e: any) => {
              e?.stopPropagation?.();
              onDelete(item.id);
            }}
            style={styles.deleteBtn}
          >
            <Ionicons name="trash-outline" size={16} color={theme.negative} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const onDelete = (id: string) => {
    const doDelete = async () => {
      try {
        await api.del(`/transactions/${id}`);
        load();
      } catch (error) {
        Alert.alert("Delete failed", error instanceof Error ? error.message : "Failed to delete transaction");
      }
    };

    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      const ok = window.confirm("Remove this transaction?");
      if (ok) void doDelete();
      return;
    }

    Alert.alert("Delete?", "Remove this transaction?", [
      { text: "Cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => { void doDelete(); },
      },
    ]);
  };

  // TEMPORARY: bulk-delete everything currently shown by the active filters, for testing/cleanup.
  const onDeleteAll = () => {
    if (items.length === 0) return;
    const doDeleteAll = async () => {
      try {
        await Promise.all(items.map((item) => api.del(`/transactions/${item.id}`)));
        load();
      } catch (error) {
        Alert.alert("Delete failed", error instanceof Error ? error.message : "Failed to delete transactions");
      }
    };

    const message = `Remove all ${items.length} transaction${items.length === 1 ? "" : "s"} currently shown?`;
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      const ok = window.confirm(message);
      if (ok) void doDeleteAll();
      return;
    }

    Alert.alert("Delete all?", message, [
      { text: "Cancel" },
      {
        text: "Delete all",
        style: "destructive",
        onPress: () => { void doDeleteAll(); },
      },
    ]);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Transactions</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            testID="transactions-delete-all"
            onPress={onDeleteAll}
            style={[styles.filterBtn, { backgroundColor: theme.surface, borderColor: theme.negative + "66" }]}
          >
            <Ionicons name="trash-outline" size={18} color={theme.negative} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="transactions-filters-toggle"
            onPress={() => setShowFilters((v) => !v)}
            style={[styles.filterBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <Ionicons name="options-outline" size={18} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      <FilterModal visible={showFilters} onClose={() => setShowFilters(false)} doneTestID="transactions-filters-done" topOffset={72}>
          <FilterSection icon="people-outline" label="MEMBER" first>
            <MemberChips members={members} selected={selected} onChange={setSelected} inline />
          </FilterSection>

          <FilterSection icon="calendar-outline" label="DATE RANGE">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {([
                { k: "all", l: "All time" },
                { k: "year", l: "1 yr" },
                { k: "3mo", l: "3 months" },
                { k: "month", l: "This month" },
                { k: "last", l: "Last month" },
              ] as { k: Range; l: string }[]).map((r) => (
                <FilterChip key={r.k} testID={`transactions-range-${r.k}`} label={r.l} active={range === r.k} onPress={() => setRange(r.k)} />
              ))}
              <FilterChip
                testID="transactions-range-custom"
                icon="calendar-clear-outline"
                label={range === "custom" ? `${customRange.start} -> ${customRange.end}` : "Custom"}
                active={range === "custom"}
                onPress={() => { setRange("custom"); setShowCustom(true); }}
              />
            </ScrollView>
          </FilterSection>

          <FilterSection icon="swap-horizontal-outline" label="TYPE">
            <SegmentedControl
              value={filter}
              onChange={(v) => setFilter(v as typeof filter)}
              options={[
                { key: "all", label: "All", testID: "type-filter-all" },
                { key: "income", label: "Income", testID: "type-filter-income" },
                { key: "expense", label: "Expense", testID: "type-filter-expense" },
              ]}
            />
          </FilterSection>

          {categories.length > 0 && (
            <FilterSection icon="grid-outline" label="CATEGORY">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {categories.map((c) => {
                  const active = selectedCategoryNames.includes(c.name);
                  return (
                    <FilterChip
                      key={c.id}
                      testID={`category-filter-${c.id}`}
                      icon={resolveCategoryIcon(c)}
                      label={c.name}
                      active={active}
                      onPress={() => setSelectedCategoryNames((cur) => (active ? cur.filter((n) => n !== c.name) : [...cur, c.name]))}
                    />
                  );
                })}
              </View>
            </FilterSection>
          )}

          {tags.length > 0 && (
            <FilterSection icon="pricetags-outline" label="TAGS">
              <MemberChips members={tags} selected={selectedTagIds} onChange={setSelectedTagIds} testID="tag-filter-chips" variant="tag" inline wrap />
            </FilterSection>
          )}
      </FilterModal>

      {!showFilters && (
        <View style={{ paddingHorizontal: 24, marginTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Checkbox
            testID="group-by-category-toggle"
            value={groupByCategory}
            onChange={onToggleGroupByCategory}
            label="Group by category"
          />
          <TouchableOpacity
            testID="transactions-sort-toggle"
            onPress={() => setShowSort(true)}
            style={[styles.sortBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <Ionicons name="swap-vertical" size={16} color={theme.text} />
          </TouchableOpacity>
        </View>
      )}

      {groupByCategory ? (
        <FlatList
          data={groupedItems}
          keyExtractor={(g) => `${g.type}|${g.category}`}
          contentContainerStyle={{ padding: 24, paddingTop: 8, paddingBottom: 100 }}
          ListEmptyComponent={<Text style={{ color: theme.textMuted, textAlign: "center", marginTop: 40 }}>No transactions yet. Tap + to add.</Text>}
          renderItem={({ item: group }) => (
            <TouchableOpacity
              testID={`tx-group-${group.type}-${group.category}`}
              onPress={() => setOpenCategory(`${group.type}|${group.category}`)}
              style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
              activeOpacity={0.7}
            >
              <View style={[styles.dot, { backgroundColor: group.type === "income" ? theme.positive : theme.negative }]} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>{group.category}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                  {group.count} transaction{group.count === 1 ? "" : "s"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Text style={{ color: group.type === "income" ? theme.positive : theme.text, fontWeight: "700", fontSize: 16 }}>
                  {group.type === "income" ? "+" : "-"}{inr(group.total)}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
              </View>
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          data={sortedItems}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 24, paddingTop: 8, paddingBottom: 100 }}
          ListEmptyComponent={<Text style={{ color: theme.textMuted, textAlign: "center", marginTop: 40 }}>No transactions yet. Tap + to add.</Text>}
          renderItem={({ item }) => renderTxRow(item)}
        />
      )}

      <TouchableOpacity
        testID="add-transaction-fab"
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={() => router.push("/transaction-form")}
      >
        <Ionicons name="add" size={28} color={theme.primaryText} />
      </TouchableOpacity>

      <Modal transparent visible={showSort} animationType="slide" onRequestClose={() => setShowSort(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setShowSort(false)} style={styles.backdrop}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: 20 + insets.bottom }]}>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Sort by</Text>
            {(groupByCategory
              ? ([
                  { key: "price_desc", label: "Price: High to Low" },
                  { key: "price_asc", label: "Price: Low to High" },
                ] as { key: SortOption; label: string }[])
              : ([
                  { key: "price_desc", label: "Price: High to Low" },
                  { key: "price_asc", label: "Price: Low to High" },
                  { key: "date_new", label: "Date: Newest first" },
                  { key: "date_old", label: "Date: Oldest first" },
                ] as { key: SortOption; label: string }[])
            ).map((opt) => (
              <TouchableOpacity
                key={opt.key}
                testID={`sort-option-${opt.key}`}
                onPress={() => { setSortBy(opt.key); setShowSort(false); }}
                style={styles.sortOptionRow}
              >
                <Text style={{ color: sortBy === opt.key ? theme.primary : theme.text, fontWeight: sortBy === opt.key ? "700" : "500", fontSize: 15 }}>
                  {opt.label}
                </Text>
                {sortBy === opt.key && <Ionicons name="checkmark" size={18} color={theme.primary} />}
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal transparent visible={showCustom} animationType="slide" onRequestClose={() => setShowCustom(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setShowCustom(false)} style={styles.backdrop}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: 20 + insets.bottom }]}>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Custom Date Range</Text>
            <Text style={{ color: theme.textMuted, marginTop: 6, fontSize: 13 }}>Filter transactions between exact dates.</Text>

            <Text style={[styles.label, { color: theme.textMuted }]}>START DATE</Text>
            <DateField value={customRange.start} onChange={(value) => setCustomRange({ ...customRange, start: value })} />

            <Text style={[styles.label, { color: theme.textMuted }]}>END DATE</Text>
            <DateField value={customRange.end} onChange={(value) => setCustomRange({ ...customRange, end: value })} />

            <TouchableOpacity testID="apply-custom-transaction-range" onPress={() => setShowCustom(false)} style={[styles.applyBtn, { backgroundColor: theme.primary }]}> 
              <Text style={{ color: theme.primaryText, fontWeight: "700" }}>Apply</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal transparent visible={!!openGroup} animationType="slide" onRequestClose={() => setOpenCategory(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setOpenCategory(null)} style={styles.backdrop}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.groupSheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.groupSheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>{openGroup?.category}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 2 }}>
                  {openGroup?.count} transaction{openGroup?.count === 1 ? "" : "s"} • {openGroup ? inr(openGroup.total) : ""}
                </Text>
              </View>
              <TouchableOpacity testID="close-group-sheet" onPress={() => setOpenCategory(null)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
              {(openGroup?.transactions || []).map((item) => renderTxRow(item, true))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingTop: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  filterBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sortBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sortOptionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 },
  row: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 20, borderWidth: 1, marginBottom: 10, gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  tagChip: { paddingHorizontal: 8, height: 22, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  deleteBtn: { padding: 6, borderRadius: 999 },
  fab: { position: "absolute", right: 24, bottom: 20, width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1 },
  groupSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 8, borderWidth: 1, maxHeight: "80%" },
  groupSheetHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 },
  label: { fontSize: 11, letterSpacing: 2, fontWeight: "700", marginTop: 18, marginBottom: 8 },
  applyBtn: { marginTop: 20, paddingVertical: 14, borderRadius: 999, alignItems: "center" },
});
