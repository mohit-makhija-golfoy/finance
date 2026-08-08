import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/src/contexts/ThemeContext";
import { api } from "@/src/api/client";
import { inr } from "@/src/constants/theme";
import Screen from "@/src/components/Screen";
import MemberChips from "@/src/components/MemberChips";

export default function Loans() {
  const { theme } = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"active" | "closed">("active");
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (selected.length) params.set("member_ids", selected.join(","));
    const [m, t] = await Promise.all([
      api.get("/members"),
      api.get(`/loans?${params.toString()}`),
    ]);
    setMembers(m);
    setItems(t);
  }, [selected]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const memberName = (id: string) => members.find((m) => m.id === id)?.name || "—";
  const visible = items.filter((i) => (i.status || "active") === statusFilter);

  const onDelete = (id: string) => {
    Alert.alert("Delete?", "Remove this loan?", [
      { text: "Cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await api.del(`/loans/${id}`); load(); } },
    ]);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Loans</Text>
        <TouchableOpacity
          testID="loans-filters-toggle"
          onPress={() => setShowFilters((v) => !v)}
          style={[styles.filterBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Ionicons name="options-outline" size={18} color={theme.text} />
        </TouchableOpacity>
      </View>

      {showFilters && (
        <>
          <MemberChips members={members} selected={selected} onChange={setSelected} />

          <View style={styles.statusRow}>
            {(["active", "closed"] as const).map((s) => (
              <TouchableOpacity key={s} testID={`loan-status-${s}`} onPress={() => setStatusFilter(s)}
                style={[styles.statusChip, { backgroundColor: statusFilter === s ? theme.primary : theme.surface, borderColor: statusFilter === s ? theme.primary : theme.border }]}> 
                <Text style={{ color: statusFilter === s ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12, textTransform: "capitalize" }}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <FlatList
        data={visible}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 24, paddingTop: 4, paddingBottom: 100 }}
        ListEmptyComponent={<Text style={{ color: theme.textMuted, textAlign: "center", marginTop: 40 }}>No loans yet. Tap + to add.</Text>}
        renderItem={({ item }) => {
          const realRemaining = item.remaining_balance ?? 0;
          const expected = item.expected_remaining ?? realRemaining;
          const showExpected = expected < realRemaining;
          const display = showExpected ? expected : realRemaining;
          const progressBase = showExpected ? (item.expected_paid_to_date || 0) : (item.total_paid || 0);
          const progress = item.total_amount > 0 ? Math.min(1, progressBase / item.total_amount) : 0;
          return (
            <TouchableOpacity
              testID={`loan-row-${item.id}`}
              onLongPress={() => onDelete(item.id)}
              onPress={() => router.push({ pathname: "/loan-detail", params: { id: item.id } })}
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
              activeOpacity={0.7}
            >
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}>{item.name}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4, letterSpacing: 1 }}>
                    EMI {inr(item.emi)} • {memberName(item.member_id)} • {item.status.toUpperCase()}
                  </Text>
                </View>
                <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>{inr(display)}</Text>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
                <View style={[styles.progressFill, { backgroundColor: theme.positive, width: `${progress * 100}%` }]} />
              </View>
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 6 }}>
                {showExpected ? `Est. paid ${inr(item.expected_paid_to_date || 0)}` : `Paid ${inr(item.total_paid)}`} of {inr(item.total_amount)}
                {showExpected ? "  •  Tap to catch up" : ""}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity
        testID="add-loan-fab"
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={() => router.push("/loan-form")}
      >
        <Ionicons name="add" size={28} color={theme.primaryText} />
      </TouchableOpacity>

      {showFilters && (
        <TouchableOpacity
          testID="loans-filters-done"
          onPress={() => setShowFilters(false)}
          style={[styles.doneFab, { backgroundColor: theme.primary }]}
        >
          <Text style={{ color: theme.primaryText, fontWeight: "700" }}>Done</Text>
        </TouchableOpacity>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingTop: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  filterBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  card: { padding: 18, borderRadius: 22, borderWidth: 1, marginBottom: 12 },
  statusRow: { flexDirection: "row", paddingHorizontal: 24, gap: 8, marginBottom: 8 },
  statusChip: { paddingHorizontal: 16, height: 32, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressTrack: { height: 6, borderRadius: 3, marginTop: 14, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  fab: { position: "absolute", right: 24, bottom: 20, width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center" },
  doneFab: { position: "absolute", right: 24, bottom: 24, paddingHorizontal: 18, height: 42, borderRadius: 999, justifyContent: "center", alignItems: "center" },
});
