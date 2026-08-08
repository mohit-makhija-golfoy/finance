import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/contexts/ThemeContext";
import { api } from "@/src/api/client";
import Screen from "@/src/components/Screen";
import DateField from "@/src/components/DateField";
import StatementUploadModal from "@/src/components/StatementUploadModal";
import StatementReviewModal, { type StatementEntryWithChoices } from "@/src/components/StatementReviewModal";
import Checkbox from "@/src/components/Checkbox";
import { guessKeyword, matchCategoryRule } from "@/src/utils/categoryRules";
import type { StatementEntry } from "@/src/types/statement";
import { toLocalYMD } from "@/src/utils/date";

const IMPORTED_CATEGORY = "Imported";
const BANK_STATEMENT_TAG = "Bank Statement";

function parseAutoReference(note?: string | null) {
  const raw = String(note || "");
  const m = raw.match(/\[AUTO_(SIP|EMI):([^:\]]+):(\d{4}-\d{2})\]/i);
  if (!m) return null;
  const kind = m[1].toUpperCase() as "SIP" | "EMI";
  const sourceId = m[2];
  const month = m[3];
  const cleaned = raw.replace(m[0], "").trim();
  const sourceLabel = kind === "SIP" ? "investment" : "loan";
  const route = kind === "SIP" ? "/investment-detail" : "/loan-detail";
  const fallback = `Auto ${kind} payment (${month})`;
  return {
    sourceId,
    route,
    sourceLabel,
    displayText: cleaned || fallback,
  };
}

export default function TransactionForm() {
  const { theme } = useTheme();
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(toLocalYMD(new Date()));
  const [notes, setNotes] = useState("");
  const [memberId, setMemberId] = useState<string>("");
  const [members, setMembers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [applyToAll, setApplyToAll] = useState(false);
  const [applyKeyword, setApplyKeyword] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [parsedEntries, setParsedEntries] = useState<StatementEntry[]>([]);
  const [parsedBankName, setParsedBankName] = useState("");
  const [parsedWarnings, setParsedWarnings] = useState<string[]>([]);
  const [defaultImportTagIds, setDefaultImportTagIds] = useState<string[]>([]);
  const [entryDefaults, setEntryDefaults] = useState<Record<string, { category: string; tagIds: string[] }>>({});
  const [importing, setImporting] = useState(false);

  const loadCats = useCallback(async () => {
    const cats = await api.get("/categories");
    setCategories(cats);
    return cats;
  }, []);

  const loadTags = useCallback(async () => {
    const t = await api.get("/tags");
    setTags(t);
    return t;
  }, []);

  const loadRules = useCallback(async () => {
    const r = await api.get("/category-rules");
    setRules(r);
    return r;
  }, []);

  const createCategoryAndReload = useCallback(async (name: string, type: "income" | "expense") => {
    const created = await api.post("/categories", { name, type });
    await loadCats();
    return created;
  }, [loadCats]);

  const createTagAndReload = useCallback(async (name: string) => {
    const created = await api.post("/tags", { name });
    await loadTags();
    return created;
  }, [loadTags]);

  const applyRuleToAll = useCallback(async (keyword: string, category: string, categoryType: "income" | "expense", tagIdsForRule: string[]) => {
    await api.post("/category-rules", { keyword, category, category_type: categoryType, tag_ids: tagIdsForRule });
    await api.post("/category-rules/apply", { keyword, category, category_type: categoryType, tag_ids: tagIdsForRule });
    await loadRules();
  }, [loadRules]);

  useFocusEffect(useCallback(() => { loadCats(); loadTags(); loadRules(); }, [loadCats, loadTags, loadRules]));

  useEffect(() => {
    (async () => {
      const [m, cats] = await Promise.all([api.get("/members"), api.get("/categories")]);
      setMembers(m);
      setCategories(cats);
      if (!memberId && m[0]) setMemberId(m[0].id);
      if (id) {
        const all = await api.get("/transactions");
        const tx = all.find((t: any) => t.id === id);
        if (tx) { setType(tx.type); setAmount(String(tx.amount)); setCategory(tx.category); setDate(tx.date); setNotes(tx.notes || ""); setMemberId(tx.member_id); setTagIds(tx.tag_ids || []); }
      } else {
        const first = cats.find((c: any) => c.type === "expense");
        if (first) setCategory(first.name);
      }
    })();
  }, [id]);

  const toggleTag = (tagId: string) => {
    setTagIds((current) => (current.includes(tagId) ? current.filter((x) => x !== tagId) : [...current, tagId]));
  };

  const toggleApplyToAll = (value: boolean) => {
    setApplyToAll(value);
    if (value && !applyKeyword) setApplyKeyword(guessKeyword(notes));
  };

  const save = async () => {
    if (!amount || !category || !memberId) {
      Alert.alert("Missing info", "Amount, category and member are required.");
      return;
    }
    setSaving(true);
    try {
      const body = { type, amount: parseFloat(amount) || 0, category, date, notes, member_id: memberId, tag_ids: tagIds };
      if (id) await api.put(`/transactions/${id}`, body);
      else await api.post("/transactions", body);

      if (applyToAll && applyKeyword.trim()) {
        try {
          await api.post("/category-rules", { keyword: applyKeyword.trim(), category, category_type: type, tag_ids: tagIds });
          await api.post("/category-rules/apply", { keyword: applyKeyword.trim(), category, category_type: type, tag_ids: tagIds });
          await loadRules();
        } catch {
          // Non-fatal: the transaction itself already saved successfully.
        }
      }

      router.back();
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to save transaction");
    } finally {
      setSaving(false);
    }
  };

  const onStatementParsed = async (entries: StatementEntry[], meta: { bankName: string; warnings: string[] }) => {
    setParsedEntries(entries);
    setParsedBankName(meta.bankName);
    setParsedWarnings(meta.warnings);

    // Resolve (creating if needed) the default tags applied to every imported
    // entry: a fixed "Bank Statement" tag plus the bank name chosen at upload time.
    const tagNames = [BANK_STATEMENT_TAG, ...(meta.bankName ? [meta.bankName] : [])];
    const resolvedTagIds: string[] = [];
    for (const name of tagNames) {
      try {
        const tag = await api.post("/tags", { name });
        resolvedTagIds.push(tag.id);
      } catch {
        // Tag may already exist under a slightly different call path; skip on failure.
      }
    }
    setDefaultImportTagIds(resolvedTagIds);
    await loadTags();
    const currentRules = await loadRules();

    // Auto-categorize each entry from saved rules (longest keyword match wins),
    // unioning the matched tags with the default Bank Statement/bank-name tags
    // rather than replacing them. Entries with no match keep the plain defaults.
    const nextDefaults: Record<string, { category: string; tagIds: string[] }> = {};
    for (const entry of entries) {
      const entryNotes = `${meta.bankName || "Bank"} • ${entry.description}`;
      const entryType = entry.direction === "credit" ? "income" : "expense";
      const match = matchCategoryRule(currentRules, entryNotes, entryType);
      if (match) {
        nextDefaults[entry.id] = {
          category: match.category,
          tagIds: Array.from(new Set([...resolvedTagIds, ...(match.tag_ids || [])])),
        };
      }
    }
    setEntryDefaults(nextDefaults);

    setUploadModalVisible(false);
    setReviewModalVisible(true);
  };

  const onConfirmImport = async (selected: StatementEntryWithChoices[]) => {
    const defaultMemberId = members[0]?.id;
    if (!defaultMemberId) {
      Alert.alert("No members found", "Add a member before importing a statement.");
      return;
    }

    setImporting(true);
    const neededCategories = new Set(
      selected.map((e) => `${e.direction === "credit" ? "income" : "expense"}|${e.category}`)
    );
    try {
      for (const key of neededCategories) {
        const [t, name] = key.split("|");
        await api.post("/categories", { name, type: t });
      }
    } catch {
      // Category may already exist; ignore and continue with the import.
    }

    // Skip anything that already exists (same date, type, amount and underlying
    // description) — protects against re-importing the same statement, or
    // overlapping date ranges across imports. The bank-name prefix is stripped
    // before comparing since it can vary between import attempts (auto-detected
    // differently, left blank, edited manually) even for the identical transaction.
    const dedupKey = (date: string, type: string, amount: number, notes: string | null | undefined) => {
      const raw = notes || "";
      const sepIndex = raw.indexOf(" • ");
      const description = sepIndex >= 0 ? raw.slice(sepIndex + 3) : raw;
      return `${date}|${type}|${amount}|${description.trim()}`;
    };

    const existingTransactions = await api.get("/transactions");
    const existingKeys = new Set(
      existingTransactions.map((t: any) => dedupKey(t.date, t.type, t.amount, t.notes))
    );

    let succeeded = 0;
    let failed = 0;
    let duplicates = 0;
    const firstErrors: string[] = [];
    for (const entry of selected) {
      const notes = `${parsedBankName || "Bank"} • ${entry.description}`;
      const type = entry.direction === "credit" ? "income" : "expense";
      const key = dedupKey(entry.date, type, entry.amount, notes);
      if (existingKeys.has(key)) {
        duplicates += 1;
        continue;
      }
      try {
        await api.post("/transactions", {
          type,
          amount: entry.amount,
          category: entry.category,
          date: entry.date,
          notes,
          member_id: defaultMemberId,
          tag_ids: entry.tagIds,
        });
        existingKeys.add(key);
        succeeded += 1;
      } catch (e) {
        failed += 1;
        const message = e instanceof Error ? e.message : String(e);
        console.error("Statement import: failed to create transaction", entry, e);
        if (firstErrors.length < 3) firstErrors.push(message);
      }
    }

    setImporting(false);
    setReviewModalVisible(false);
    setParsedEntries([]);
    await loadCats();

    const parts = [`${succeeded} of ${selected.length} imported.`];
    if (duplicates > 0) parts.push(`${duplicates} skipped as duplicate${duplicates === 1 ? "" : "s"}.`);
    if (failed > 0) parts.push(`${failed} failed${firstErrors.length ? `: ${firstErrors.join("; ")}` : "."}`);
    Alert.alert("Import complete", parts.join(" "));
  };

  const cats = categories.filter((c) => c.type === type);
  const linked = parseAutoReference(notes);

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <TouchableOpacity testID="back-btn" onPress={() => router.back()}><Ionicons name="close" size={24} color={theme.text} /></TouchableOpacity>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>{id ? "Edit" : "New"} Transaction</Text>
          <TouchableOpacity testID="save-tx-btn" onPress={save} disabled={saving}><Text style={{ color: theme.text, fontWeight: "700", opacity: saving ? 0.5 : 1 }}>{saving ? "Saving..." : "Save"}</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: id ? 120 : 180 }} keyboardShouldPersistTaps="handled">
          <View style={styles.toggle}>
            {(["expense", "income"] as const).map((t) => (
              <TouchableOpacity key={t} testID={`type-${t}`} onPress={() => {
                setType(t);
                const first = categories.find((c) => c.type === t);
                if (first) setCategory(first.name);
              }} style={[styles.toggleBtn, { backgroundColor: type === t ? theme.primary : theme.surface, borderColor: type === t ? theme.primary : theme.border }]}>
                <Text style={{ color: type === t ? theme.primaryText : theme.text, fontWeight: "700" }}>{t === "income" ? "Income" : "Expense"}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Field label="AMOUNT (\u20B9)"><TextInput testID="amount-input" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0" placeholderTextColor={theme.textMuted} style={inputStyle(theme)} /></Field>

          <Field label="CATEGORY">
            <View style={styles.chipRow}>
              {cats.map((c) => (
                <TouchableOpacity key={c.id} testID={`cat-${c.name}`} onPress={() => setCategory(c.name)}
                  style={[styles.chip, { backgroundColor: category === c.name ? theme.primary : theme.surface, borderColor: category === c.name ? theme.primary : theme.border }]}>
                  <Text style={{ color: category === c.name ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12 }}>{c.name}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity testID="manage-categories" onPress={() => router.push("/categories")}
                style={[styles.chip, { backgroundColor: "transparent", borderColor: theme.border, borderStyle: "dashed" as any }]}>
                <Text style={{ color: theme.textMuted, fontWeight: "600", fontSize: 12 }}>＋ Manage</Text>
              </TouchableOpacity>
            </View>
            <View style={{ marginTop: 12 }}>
              <Checkbox
                testID="apply-rule-to-all"
                value={applyToAll}
                onChange={toggleApplyToAll}
                label="Apply this category & tags to all transactions with a similar note"
              />
              {applyToAll && (
                <TextInput
                  testID="apply-rule-keyword"
                  value={applyKeyword}
                  onChangeText={setApplyKeyword}
                  placeholder="Match keyword (e.g. Zomato)"
                  placeholderTextColor={theme.textMuted}
                  style={[inputStyle(theme), { marginTop: 8 }]}
                />
              )}
            </View>
          </Field>

          <Field label="MEMBER">
            <View style={styles.chipRow}>
              {members.map((m) => (
                <TouchableOpacity key={m.id} testID={`member-${m.id}`} onPress={() => setMemberId(m.id)}
                  style={[styles.chip, { backgroundColor: memberId === m.id ? theme.primary : theme.surface, borderColor: memberId === m.id ? theme.primary : theme.border }]}>
                  <Text style={{ color: memberId === m.id ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12 }}>{m.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          <Field label="TAGS">
            <View style={styles.chipRow}>
              {tags.map((t) => (
                <TouchableOpacity key={t.id} testID={`tag-${t.id}`} onPress={() => toggleTag(t.id)}
                  style={[styles.chip, { backgroundColor: tagIds.includes(t.id) ? theme.primary : theme.surface, borderColor: tagIds.includes(t.id) ? theme.primary : theme.border }]}>
                  <Text style={{ color: tagIds.includes(t.id) ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12 }}>{t.name}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity testID="manage-tags" onPress={() => router.push("/tags")}
                style={[styles.chip, { backgroundColor: "transparent", borderColor: theme.border, borderStyle: "dashed" as any }]}>
                <Text style={{ color: theme.textMuted, fontWeight: "600", fontSize: 12 }}>＋ Manage</Text>
              </TouchableOpacity>
            </View>
          </Field>

          <Field label="DATE"><DateField testID="date-input" value={date} onChange={setDate} /></Field>
          <Field label="NOTES">
            <TextInput testID="notes-input" value={notes} onChangeText={setNotes} placeholder="Optional" placeholderTextColor={theme.textMuted} style={inputStyle(theme)} />
            {linked && (
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>{linked.displayText}</Text>
                <TouchableOpacity onPress={() => router.push({ pathname: linked.route as any, params: { id: linked.sourceId } })} style={{ marginTop: 4, alignSelf: "flex-start" }}>
                  <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "600" }}>Open linked {linked.sourceLabel}</Text>
                </TouchableOpacity>
              </View>
            )}
          </Field>

          {id && (
            <TouchableOpacity testID="delete-tx-btn" onPress={() => {
              const doDelete = async () => {
                try {
                  await api.del(`/transactions/${id}`);
                  router.back();
                } catch (error) {
                  Alert.alert("Delete failed", error instanceof Error ? error.message : "Failed to delete transaction");
                }
              };

              if (typeof window !== "undefined" && typeof window.confirm === "function") {
                const ok = window.confirm("Delete transaction? This cannot be undone.");
                if (ok) void doDelete();
                return;
              }

              Alert.alert("Delete transaction?", "This cannot be undone.", [
                { text: "Cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => { void doDelete(); },
                },
              ]);
            }} style={{ marginTop: 32, padding: 16, borderRadius: 999, borderWidth: 1, borderColor: theme.negative, alignItems: "center" }}>
              <Text style={{ color: theme.negative, fontWeight: "700" }}>Delete transaction</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {!id && (
          <View style={[styles.uploadBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <TouchableOpacity
              testID="upload-statement-btn"
              onPress={() => setUploadModalVisible(true)}
              style={[styles.uploadBtn, { borderColor: theme.border }]}
            >
              <Ionicons name="document-attach-outline" size={18} color={theme.text} />
              <Text style={{ color: theme.text, fontWeight: "700" }}>Upload statement</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      <StatementUploadModal
        visible={uploadModalVisible}
        onClose={() => setUploadModalVisible(false)}
        onParsed={onStatementParsed}
      />
      <StatementReviewModal
        visible={reviewModalVisible}
        entries={parsedEntries}
        bankName={parsedBankName}
        warnings={parsedWarnings}
        categories={categories}
        tags={tags}
        defaultCategory={IMPORTED_CATEGORY}
        defaultTagIds={defaultImportTagIds}
        entryDefaults={entryDefaults}
        onCreateCategory={createCategoryAndReload}
        onCreateTag={createTagAndReload}
        onApplyRuleToAll={applyRuleToAll}
        submitting={importing}
        onClose={() => setReviewModalVisible(false)}
        onConfirm={onConfirmImport}
      />
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
  toggle: { flexDirection: "row", gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 14, borderRadius: 999, borderWidth: 1, alignItems: "center" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  uploadBar: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, borderTopWidth: 1 },
  uploadBtn: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 999, borderWidth: 1 },
});
