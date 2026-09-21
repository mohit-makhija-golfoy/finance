import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/src/contexts/ThemeContext";
import { api } from "@/src/api/client";
import { inr } from "@/src/constants/theme";
import Screen from "@/src/components/Screen";
import MemberChips from "@/src/components/MemberChips";
import FilterSection from "@/src/components/FilterSection";
import SegmentedControl from "@/src/components/SegmentedControl";
import FilterModal from "@/src/components/FilterModal";
import { confirmAction } from "@/src/utils/confirm";
import { projectedMaturity } from "@/src/utils/investment";
import { formatLongDate } from "@/src/utils/date";

function isMaturingThisMonth(maturityDate?: string | null): boolean {
  if (!maturityDate) return false;
  const d = new Date(`${maturityDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function ordinalDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const n = d.getDate();
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
}

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
    confirmAction("Delete?", "Remove this investment?", "Delete", async () => {
      await api.del(`/investments/${id}`);
      load();
    });
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

      <View style={{ paddingHorizontal: 24, marginTop: 12 }}>
        <SegmentedControl
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as typeof statusFilter)}
          options={[
            { key: "active", label: "Active", testID: "inv-status-active" },
            { key: "closed", label: "Closed", testID: "inv-status-closed" },
          ]}
        />
      </View>

      <FilterModal visible={showFilters} onClose={() => setShowFilters(false)} doneTestID="investments-filters-done" topOffset={64}>
        <FilterSection icon="people-outline" label="MEMBER" first>
          <MemberChips members={members} selected={selected} onChange={setSelected} inline />
        </FilterSection>
      </FilterModal>

      <FlatList
        data={visible}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 24, paddingTop: 4, paddingBottom: 100 }}
        ListEmptyComponent={<Text style={{ color: theme.textMuted, textAlign: "center", marginTop: 40 }}>No investments yet. Tap + to add.</Text>}
        renderItem={({ item }) => {
          const pl = item.profit_loss || 0;
          const withdrawn = item.total_withdrawn || 0;
          const { hasReturn, maturityValue, totalInterest } = projectedMaturity(item);
          const maturingThisMonth = item.status === "active" && item.type === "onetime" && isMaturingThisMonth(item.maturity_date);
          const isMatured = item.status === "closed" && !!item.matured_date;
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
                  <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    <Text style={{ color: theme.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                      {item.type === "recurring" ? `${inr(item.amount)} / month` : item.type} • {memberName(item.member_id)} • {item.status}
                    </Text>
                    {isMatured && (
                      <View style={[styles.tag, { backgroundColor: theme.positive + "22", borderColor: theme.positive }]}>
                        <Text style={{ color: theme.positive, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 }}>MATURED</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>{inr(item.current_value || 0)}</Text>
              </View>
              {maturingThisMonth && (
                <View style={[styles.maturingBanner, { backgroundColor: theme.positive + "18", borderColor: theme.positive }]}>
                  <Ionicons name="alarm-outline" size={14} color={theme.positive} />
                  <Text style={{ color: theme.positive, fontSize: 12, fontWeight: "700", marginLeft: 6 }}>
                    Maturing this month on {ordinalDay(item.maturity_date)}
                  </Text>
                </View>
              )}
              {isMatured && (
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 8 }}>
                  Matured on {formatLongDate(item.matured_date)} with {inr(item.matured_amount || 0)}, added to income.
                </Text>
              )}
              {hasReturn && !isMatured ? (
                <View style={[styles.rowBetween, { marginTop: 12 }]}>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>Matures {inr(maturityValue)}{item.maturity_date ? ` on ${formatLongDate(item.maturity_date)}` : ""}</Text>
                  <Text style={{ color: theme.positive, fontSize: 13, fontWeight: "700" }}>+{inr(totalInterest)} P/L</Text>
                </View>
              ) : !isMatured ? (
                <View style={[styles.rowBetween, { marginTop: 12 }]}>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>Invested {inr(item.total_invested || 0)}</Text>
                  <Text style={{ color: pl >= 0 ? theme.positive : theme.negative, fontSize: 13, fontWeight: "700" }}>
                    {pl >= 0 ? "+" : ""}{inr(pl)} P/L
                  </Text>
                </View>
              ) : null}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingTop: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  filterBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  card: { padding: 18, borderRadius: 22, borderWidth: 1, marginBottom: 12 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  withdrawRow: { marginTop: 10, borderTopWidth: 1, paddingTop: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fab: { position: "absolute", right: 24, bottom: 20, width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center" },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  maturingBanner: { flexDirection: "row", alignItems: "center", marginTop: 12, padding: 10, borderRadius: 12, borderWidth: 1 },
});
