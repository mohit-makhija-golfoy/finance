import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/src/contexts/ThemeContext";
import { api } from "@/src/api/client";
import { inr } from "@/src/constants/theme";
import Screen from "@/src/components/Screen";
import MemberChips from "@/src/components/MemberChips";

export default function Investments() {
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
      api.get(`/investments?${params.toString()}`),
    ]);
    setMembers(m);
    setItems(t);
  }, [selected]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const memberName = (id: string) => members.find((m) => m.id === id)?.name || "—";
  const visible = items.filter((i) => (i.status || "active") === statusFilter);

  const onDelete = (id: string) => {
    Alert.alert("Delete?", "Remove this investment?", [
      { text: "Cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await api.del(`/investments/${id}`); load(); } },
    ]);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Investments</Text>
        <TouchableOpacity
          testID="investments-filters-toggle"
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
              <TouchableOpacity key={s} testID={`inv-status-${s}`} onPress={() => setStatusFilter(s)}
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
        ListEmptyComponent={<Text style={{ color: theme.textMuted, textAlign: "center", marginTop: 40 }}>No investments yet. Tap + to add.</Text>}
        renderItem={({ item }) => {
          const pl = item.profit_loss || 0;
          const withdrawn = item.total_withdrawn || 0;
          return (
            <TouchableOpacity
              testID={`inv-row-${item.id}`}
              onLongPress={() => onDelete(item.id)}
              onPress={() => router.push({ pathname: "/investment-detail", params: { id: item.id } })}
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
              activeOpacity={0.7}
            >
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}>{item.name}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                    {item.type === "recurring" ? `${inr(item.amount)} / month` : item.type} • {memberName(item.member_id)} • {item.status}
                  </Text>
                </View>
                <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>{inr(item.current_value || 0)}</Text>
              </View>
              <View style={[styles.rowBetween, { marginTop: 12 }]}>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>Invested {inr(item.total_invested || 0)}</Text>
                <Text style={{ color: pl >= 0 ? theme.positive : theme.negative, fontSize: 13, fontWeight: "700" }}>
                  {pl >= 0 ? "+" : ""}{inr(pl)}
                </Text>
              </View>
              {withdrawn > 0 && (
                <View style={[styles.withdrawRow, { borderColor: theme.border }]}> 
                  <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 }}>
                    Withdrawn
                  </Text>
                  <Text style={{ color: theme.negative, fontSize: 12, fontWeight: "700" }}>-{inr(withdrawn)}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity
        testID="add-investment-fab"
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={() => router.push("/investment-form")}
      >
        <Ionicons name="add" size={28} color={theme.primaryText} />
      </TouchableOpacity>

      {showFilters && (
        <TouchableOpacity
          testID="investments-filters-done"
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
  withdrawRow: { marginTop: 10, borderTopWidth: 1, paddingTop: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fab: { position: "absolute", right: 24, bottom: 20, width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center" },
  doneFab: { position: "absolute", right: 24, bottom: 24, paddingHorizontal: 18, height: 42, borderRadius: 999, justifyContent: "center", alignItems: "center" },
});
