import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ImageBackground, ActivityIndicator, RefreshControl, useWindowDimensions, TouchableOpacity, Alert, Platform, Modal } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/contexts/ThemeContext";
import { useAuth } from "@/src/contexts/AuthContext";
import { api } from "@/src/api/client";
import { inr, inrFull } from "@/src/constants/theme";
import Screen from "@/src/components/Screen";
import PieChart from "@/src/components/PieChart";
import MemberChips from "@/src/components/MemberChips";
import { toLocalYMD } from "@/src/utils/date";

const BG_DARK = "https://images.pexels.com/photos/29041985/pexels-photo-29041985.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";
const BG_LIGHT = "https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjV8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGxpZ2h0JTIwd2F2ZXMlMjB0ZXh0dXJlfGVufDB8fHx8MTc4MDY0NDMxOXww&ixlib=rb-4.1.0&q=85";

type Range = "all" | "month" | "3mo" | "year" | "custom";

function monthStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function monthEnd(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function ymd(d: Date) { return toLocalYMD(d); }
function monthKey(d: Date) { return toLocalYMD(d).slice(0, 7); }

function rangeFor(r: Range, custom?: { from: Date; to: Date }): { start_date?: string; end_date?: string } {
  const today = new Date();
  if (r === "all") return {};
  if (r === "custom" && custom) {
    return { start_date: ymd(monthStart(custom.from)), end_date: ymd(monthEnd(custom.to)) };
  }
  let start: Date;
  const end = monthEnd(today);
  if (r === "month") start = monthStart(today);
  else if (r === "3mo") start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  else start = new Date(today.getFullYear() - 1, today.getMonth(), 1);
  return { start_date: ymd(start), end_date: ymd(end) };
}

export default function Dashboard() {
  const { theme, mode } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [data, setData] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [range, setRange] = useState<Range>("month");
  const [custom, setCustom] = useState<{ from: Date; to: Date }>({ from: monthStart(new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1)), to: monthEnd(new Date()) });
  const [showCustom, setShowCustom] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<{ category: string; items: any[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selected.length) params.set("member_ids", selected.join(","));
      const { start_date, end_date } = rangeFor(range, custom);
      if (start_date) params.set("start_date", start_date);
      if (end_date) params.set("end_date", end_date);
      const [m, d, r] = await Promise.all([
        api.get("/members"),
        api.get(`/dashboard?${params.toString()}`),
        api.get("/reminders"),
      ]);
      setMembers(m);
      setData(d);
      setReminders(r);
    } catch (e) {
      console.log("dashboard err", e);
    } finally {
      setLoading(false);
    }
  }, [selected, range, custom]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const payReminder = async (rem: any) => {
    try {
      await api.post("/reminders/pay", { kind: rem.kind, id: rem.id, month: rem.month });
      load();
    } catch (e: any) { Alert.alert("Pay failed", e.message); }
  };

  const drillCategory = async (cat: string) => {
    const { start_date, end_date } = rangeFor(range, custom);
    const params = new URLSearchParams();
    params.set("category", cat);
    if (selected.length) params.set("member_ids", selected.join(","));
    if (start_date) params.set("start_date", start_date);
    if (end_date) params.set("end_date", end_date);
    const items = await api.get(`/transactions?${params.toString()}`);
    setDrilldown({ category: cat, items });
  };

  const expense = data?.expense || 0;
  const income = data?.income || 0;
  const saved = data?.saved || 0;
  const expenseBreakdown = (data?.breakdown?.expense || []) as { category: string; amount: number }[];
  const incomeBreakdown = (data?.breakdown?.income || []) as { category: string; amount: number }[];
  const emiByLoan = (data?.breakdown?.emi_by_loan || []) as { id: string; name: string; amount: number }[];
  const sipByInv = (data?.breakdown?.sip_by_investment || []) as { id: string; name: string; amount: number }[];

  // Pie: income allocation (expense categories + saved)
  const pieData = [...expenseBreakdown.map((e) => ({ label: e.category, value: e.amount })), { label: "Saved", value: saved, color: "#22C55E" }];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.text} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greet, { color: theme.textMuted }]}>HELLO</Text>
            <Text style={[styles.name, { color: theme.text }]} testID="dashboard-greeting">{user?.full_name || user?.email?.split("@")[0]}</Text>
          </View>
          <View style={styles.headerActions}>
            {reminders.length > 0 && (
              <View style={[styles.bellBadge, { backgroundColor: theme.negative }]} testID="reminder-badge">
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{reminders.length}</Text>
              </View>
            )}
            <TouchableOpacity
              testID="dashboard-filters-toggle"
              onPress={() => setShowFilters((v) => !v)}
              style={[styles.filterBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <Ionicons name="options-outline" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>
        </View>

        {showFilters && (
          <View style={styles.filterPanel}>
            {/* Range pills */}
            <View style={{ height: 48 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rangeRow}>
                {([
                  { k: "all", l: "All time" },
                  { k: "year", l: "1 yr" },
                  { k: "3mo", l: "3 mo" },
                  { k: "month", l: "This month" },
                ] as { k: Range; l: string }[]).map((r) => (
                  <TouchableOpacity key={r.k} testID={`range-${r.k}`} onPress={() => setRange(r.k)}
                    style={[styles.rangeChip, { backgroundColor: range === r.k ? theme.primary : theme.surface, borderColor: range === r.k ? theme.primary : theme.border }]}> 
                    <Text style={{ color: range === r.k ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12 }}>{r.l}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity testID="range-custom" onPress={() => { setRange("custom"); setShowCustom(true); }}
                  style={[styles.rangeChip, { backgroundColor: range === "custom" ? theme.primary : theme.surface, borderColor: range === "custom" ? theme.primary : theme.border, flexDirection: "row", gap: 4 }]}> 
                  <Ionicons name="calendar-outline" size={14} color={range === "custom" ? theme.primaryText : theme.textMuted} />
                  <Text style={{ color: range === "custom" ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12 }}>
                    {range === "custom" ? `${monthKey(custom.from)} → ${monthKey(custom.to)}` : "Custom"}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>

            <MemberChips members={members} selected={selected} onChange={setSelected} />
          </View>
        )}

        {/* Net worth hero (all-time active) */}
        <ImageBackground
          source={{ uri: mode === "dark" ? BG_DARK : BG_LIGHT }}
          style={[styles.heroCard, { backgroundColor: theme.surface, width: width - 48 }]}
          imageStyle={{ borderRadius: 28, opacity: mode === "dark" ? 0.45 : 0.6 }}
          testID="net-worth-card"
        >
          <Text style={[styles.heroLabel, { color: theme.text }]}>NET WORTH (ALL TIME)</Text>
          <Text style={[styles.heroValue, { color: theme.text }]} testID="net-worth-value">{inrFull(data?.net_worth || 0)}</Text>
          <View style={styles.heroRow}>
            <View>
              <Text style={[styles.heroSubLabel, { color: theme.text, opacity: 0.7 }]}>Assets</Text>
              <Text style={[styles.heroSubValue, { color: theme.positive }]}>{inr(data?.portfolio_value || 0)}</Text>
            </View>
            <View>
              <Text style={[styles.heroSubLabel, { color: theme.text, opacity: 0.7 }]}>Liabilities</Text>
              <Text style={[styles.heroSubValue, { color: theme.negative }]}>{inr(data?.loan_outstanding || 0)}</Text>
            </View>
          </View>
        </ImageBackground>

        {/* Reminders */}
        {reminders.length > 0 && (
          <View style={{ paddingHorizontal: 24, marginTop: 16 }}>
            <Text style={[styles.cardLabel, { color: theme.textMuted, marginBottom: 8 }]}>DUE THIS MONTH</Text>
            {reminders.map((r) => (
              <View key={`${r.kind}-${r.id}`} testID={`reminder-${r.kind}-${r.id}`} style={[styles.reminderCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.iconBox, { backgroundColor: r.kind === "loan" ? theme.negative + "22" : theme.positive + "22" }]}>
                  <Ionicons name={r.kind === "loan" ? "cash-outline" : "trending-up-outline"} size={18} color={r.kind === "loan" ? theme.negative : theme.positive} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: "700" }}>{r.name}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>{r.kind === "loan" ? "EMI" : "SIP"} • {r.member_name}</Text>
                </View>
                <Text style={{ color: theme.text, fontWeight: "700", marginRight: 12 }}>{inr(r.amount)}</Text>
                <TouchableOpacity testID={`pay-${r.kind}-${r.id}`} onPress={() => payReminder(r)} style={[styles.payBtn, { backgroundColor: theme.primary }]}>
                  <Text style={{ color: theme.primaryText, fontWeight: "700", fontSize: 13 }}>Pay</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Range-scoped stat tiles */}
        <View style={styles.row}>
          <StatCard label="CURRENT BALANCE" value={inr(data?.current_balance || 0)} sub={`After EMI/SIP outflows`} subColor={theme.textMuted} />
          <StatCard label="INVESTED (RANGE)" value={inr(data?.total_invested || 0)} sub={`${data?.active_investments || 0} active`} subColor={theme.textMuted} />
        </View>
        <View style={styles.row}>
          <StatCard label="INCOME" value={inr(income)} sub="this period" subColor={theme.positive} />
          <StatCard label="EXPENSE" value={inr(expense)} sub="this period" subColor={theme.negative} />
        </View>
        <View style={styles.row}>
          <StatCard label="LOAN OUTSTANDING" value={inr(data?.loan_outstanding || 0)} sub={`${data?.active_loans || 0} new`} subColor={theme.textMuted} />
          <StatCard label="SAVED" value={inr(saved)} sub="this period" subColor={theme.positive} />
        </View>

        {/* Pie chart */}
        <View style={[styles.chartCard, { backgroundColor: theme.surface, borderColor: theme.border }]} testID="allocation-pie">
          <Text style={[styles.cardLabel, { color: theme.textMuted }]}>INCOME ALLOCATION</Text>
          <Text style={[styles.cardValue, { color: theme.text }]}>{inr(income)} earned</Text>
          <View style={{ marginTop: 16, alignItems: "center" }}>
            <PieChart data={pieData} size={Math.min(260, width - 110)} centerLabel="EXPENSE" centerValue={inr(expense)} />
          </View>
        </View>

        {/* Detailed breakdown */}
        <View style={{ paddingHorizontal: 24, marginTop: 20 }}>
          <Text style={[styles.cardLabel, { color: theme.textMuted, marginBottom: 8 }]}>INCOME • {inr(income)}</Text>
          <View style={[styles.breakdownCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {incomeBreakdown.length === 0 && <Text style={{ color: theme.textMuted }}>No income in this range.</Text>}
            {incomeBreakdown.map((row) => (
              <TouchableOpacity key={row.category} testID={`income-row-${row.category}`} onPress={() => drillCategory(row.category)} style={styles.bRow}>
                <Text style={{ color: theme.text, flex: 1, fontWeight: "500" }}>{row.category}</Text>
                <Text style={{ color: theme.text, fontWeight: "700" }}>{inr(row.amount)}</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.textMuted} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.cardLabel, { color: theme.textMuted, marginTop: 20, marginBottom: 8 }]}>EXPENSE • {inr(expense)}</Text>
          <View style={[styles.breakdownCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {expenseBreakdown.length === 0 && <Text style={{ color: theme.textMuted }}>No expenses in this range.</Text>}
            {expenseBreakdown.map((row) => {
              const subList = row.category === "EMI" ? emiByLoan : row.category === "SIP" ? sipByInv : null;
              const isExp = expanded === row.category;
              return (
                <View key={row.category}>
                  <TouchableOpacity testID={`expense-row-${row.category}`} onPress={() => {
                    if (subList) setExpanded(isExp ? null : row.category);
                    else drillCategory(row.category);
                  }} style={styles.bRow}>
                    <Text style={{ color: theme.text, flex: 1, fontWeight: "500" }}>{row.category}</Text>
                    <Text style={{ color: theme.text, fontWeight: "700" }}>{inr(row.amount)}</Text>
                    <Ionicons name={subList ? (isExp ? "chevron-down" : "chevron-forward") : "chevron-forward"} size={16} color={theme.textMuted} style={{ marginLeft: 6 }} />
                  </TouchableOpacity>
                  {subList && isExp && (
                    <View style={{ paddingLeft: 16, paddingBottom: 6 }}>
                      {subList.map((s) => (
                        <View key={s.id} style={styles.subRow}>
                          <View style={[styles.subDot, { backgroundColor: theme.textMuted }]} />
                          <Text style={{ color: theme.textMuted, flex: 1, fontSize: 13 }}>{s.name}</Text>
                          <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>{inr(s.amount)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {loading && !data && <ActivityIndicator color={theme.text} style={{ marginTop: 40 }} />}
      </ScrollView>

      <CustomRangeModal visible={showCustom} onClose={() => setShowCustom(false)} value={custom} onChange={(v) => { setCustom(v); setRange("custom"); }} />
      <DrilldownModal visible={!!drilldown} data={drilldown} onClose={() => setDrilldown(null)} />
      {showFilters && (
        <TouchableOpacity
          testID="dashboard-filters-done"
          onPress={() => setShowFilters(false)}
          style={[styles.doneFab, { backgroundColor: theme.primary }]}
        >
          <Text style={{ color: theme.primaryText, fontWeight: "700" }}>Done</Text>
        </TouchableOpacity>
      )}
    </Screen>
  );
}

function StatCard({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.cardLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.cardValue, { color: theme.text }]}>{value}</Text>
      {sub && <Text style={{ color: subColor, fontSize: 12, marginTop: 4, fontWeight: "600" }}>{sub}</Text>}
    </View>
  );
}

function CustomRangeModal({ visible, onClose, value, onChange }: any) {
  const { theme } = useTheme();
  const [from, setFrom] = useState<Date>(value.from);
  const [to, setTo] = useState<Date>(value.to);

  const setMonth = (which: "from" | "to", delta: number) => {
    if (which === "from") setFrom(new Date(from.getFullYear(), from.getMonth() + delta, 1));
    else setTo(new Date(to.getFullYear(), to.getMonth() + delta, 1));
  };
  const apply = () => { onChange({ from, to: monthEnd(to) }); onClose(); };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700", marginBottom: 16 }}>Custom Range (by Month)</Text>
          <MonthPicker label="FROM" date={from} onShift={(d) => setMonth("from", d)} />
          <MonthPicker label="TO" date={to} onShift={(d) => setMonth("to", d)} />
          <TouchableOpacity testID="apply-range" onPress={apply} style={[{ marginTop: 20, paddingVertical: 14, borderRadius: 999, alignItems: "center", backgroundColor: theme.primary }]}>
            <Text style={{ color: theme.primaryText, fontWeight: "700" }}>Apply</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function MonthPicker({ label, date, onShift }: any) {
  const { theme } = useTheme();
  const monthName = date.toLocaleString("default", { month: "long", year: "numeric" });
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginBottom: 8 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.background }}>
        <TouchableOpacity onPress={() => onShift(-1)} style={{ padding: 8 }}><Ionicons name="chevron-back" size={20} color={theme.text} /></TouchableOpacity>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>{monthName}</Text>
        <TouchableOpacity onPress={() => onShift(1)} style={{ padding: 8 }}><Ionicons name="chevron-forward" size={20} color={theme.text} /></TouchableOpacity>
      </View>
    </View>
  );
}

function DrilldownModal({ visible, data, onClose }: any) {
  const { theme } = useTheme();
  if (!data) return null;
  const total = data.items.reduce((s: number, t: any) => s + t.amount, 0);
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border, maxHeight: "80%" }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700" }}>{data.category}</Text>
              <Text style={{ color: theme.text, fontSize: 22, fontWeight: "700", marginTop: 4 }}>{inr(total)}</Text>
            </View>
            <TouchableOpacity testID="drilldown-close" onPress={onClose} style={{ padding: 8 }}><Ionicons name="close" size={24} color={theme.text} /></TouchableOpacity>
          </View>
          <ScrollView style={{ marginTop: 16 }} contentContainerStyle={{ paddingBottom: 20 }}>
            {data.items.length === 0 && <Text style={{ color: theme.textMuted }}>No transactions.</Text>}
            {data.items.map((t: any) => (
              <View key={t.id} style={{ flexDirection: "row", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: "600" }}>{t.notes || t.category}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>{t.date}</Text>
                </View>
                <Text style={{ color: t.type === "income" ? theme.positive : theme.text, fontWeight: "700" }}>{inr(t.amount)}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  greet: { fontSize: 11, letterSpacing: 2, fontWeight: "600" },
  name: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  bellBadge: { minWidth: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  filterBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  filterPanel: { marginTop: 6 },
  rangeRow: { paddingHorizontal: 24, gap: 8, alignItems: "center", height: 48 },
  rangeChip: { paddingHorizontal: 14, height: 32, borderRadius: 999, borderWidth: 1, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  heroCard: { marginHorizontal: 24, marginTop: 8, padding: 24, borderRadius: 28, minHeight: 180, justifyContent: "space-between", overflow: "hidden" },
  heroLabel: { fontSize: 11, letterSpacing: 3, fontWeight: "700" },
  heroValue: { fontSize: 38, fontWeight: "700", marginTop: 8, letterSpacing: -1 },
  heroRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  heroSubLabel: { fontSize: 10, letterSpacing: 1.5, fontWeight: "600" },
  heroSubValue: { fontSize: 16, fontWeight: "700", marginTop: 2 },
  reminderCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, marginBottom: 10 },
  iconBox: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  payBtn: { paddingHorizontal: 16, height: 36, borderRadius: 999, justifyContent: "center" },
  row: { flexDirection: "row", gap: 12, paddingHorizontal: 24, marginTop: 12 },
  statCard: { flex: 1, padding: 16, borderRadius: 20, borderWidth: 1 },
  cardLabel: { fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  cardValue: { fontSize: 22, fontWeight: "700", marginTop: 6, letterSpacing: -0.5 },
  chartCard: { marginHorizontal: 24, marginTop: 20, padding: 20, borderRadius: 24, borderWidth: 1 },
  breakdownCard: { padding: 8, borderRadius: 20, borderWidth: 1 },
  bRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12 },
  subRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: 8 },
  subDot: { width: 4, height: 4, borderRadius: 2 },
  sheet: { padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1 },
  doneFab: { position: "absolute", right: 24, bottom: 24, paddingHorizontal: 18, height: 42, borderRadius: 999, justifyContent: "center", alignItems: "center" },
});
