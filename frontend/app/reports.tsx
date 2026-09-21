import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions, Modal } from "react-native";
import { useRouter, useFocusEffect, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { useTheme } from "@/src/contexts/ThemeContext";
import { api } from "@/src/api/client";
import { inr } from "@/src/constants/theme";
import Screen from "@/src/components/Screen";
import PieChart from "@/src/components/PieChart";
import DateField from "@/src/components/DateField";
import { toLocalYMD } from "@/src/utils/date";

type Range = "month" | "3mo" | "year" | "all" | "custom";

function rangeFor(r: Range, custom?: { start: string; end: string }): { start_date?: string; end_date?: string } {
  const today = new Date();
  if (r === "all") return {};
  if (r === "custom") {
    return custom?.start && custom?.end ? { start_date: custom.start, end_date: custom.end } : {};
  }
  const end = toLocalYMD(today);
  let start: Date;
  if (r === "month") start = new Date(today.getFullYear(), today.getMonth(), 1);
  else if (r === "3mo") start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  else start = new Date(today.getFullYear() - 1, today.getMonth(), 1);
  return { start_date: toLocalYMD(start), end_date: end };
}

export default function Reports() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [range, setRange] = useState<Range>("3mo");
  const [side, setSide] = useState<"expense" | "income">("expense");
  const [data, setData] = useState<any>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customRange, setCustomRange] = useState({
    start: toLocalYMD(new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1)),
    end: toLocalYMD(new Date()),
  });

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    const { start_date, end_date } = rangeFor(range, customRange);
    if (start_date) params.set("start_date", start_date);
    if (end_date) params.set("end_date", end_date);
    const d = await api.get(`/dashboard?${params.toString()}`);
    setData(d);
  }, [range, customRange]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rows = (side === "expense" ? data?.breakdown?.expense : data?.breakdown?.income) || [];
  const total = rows.reduce((s: number, r: any) => s + r.amount, 0);

  // Bar chart
  const barH = 32;
  const barWidth = width - 96;
  const maxVal = Math.max(1, ...rows.map((r: any) => r.amount));
  const colors = ["#10B981", "#F43F5E", "#3B82F6", "#F59E0B", "#A855F7", "#06B6D4", "#EC4899", "#84CC16"];

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={theme.text} /></TouchableOpacity>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Reports</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={{ paddingHorizontal: 24 }}>
          <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginBottom: 8 }}>RANGE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {([{k:"month",l:"This month"},{k:"3mo",l:"3 months"},{k:"year",l:"1 yr"},{k:"all",l:"All time"}] as {k:Range,l:string}[]).map((r) => (
              <TouchableOpacity key={r.k} testID={`reports-range-${r.k}`} onPress={() => setRange(r.k)}
                style={[styles.chip, { backgroundColor: range === r.k ? theme.primary : theme.surface, borderColor: range === r.k ? theme.primary : theme.border }]}>
                <Text style={{ color: range === r.k ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12 }}>{r.l}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity testID="reports-range-custom" onPress={() => { setRange("custom"); setShowCustom(true); }}
              style={[styles.chip, { backgroundColor: range === "custom" ? theme.primary : theme.surface, borderColor: range === "custom" ? theme.primary : theme.border }]}> 
              <Text style={{ color: range === "custom" ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12 }}>
                {range === "custom" ? `${customRange.start} → ${customRange.end}` : "Custom"}
              </Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 20 }}>
            {(["expense", "income"] as const).map((s) => (
              <TouchableOpacity key={s} testID={`reports-side-${s}`} onPress={() => setSide(s)}
                style={[styles.tab, { backgroundColor: side === s ? theme.primary : theme.surface, borderColor: side === s ? theme.primary : theme.border }]}>
                <Text style={{ color: side === s ? theme.primaryText : theme.text, fontWeight: "700", textTransform: "capitalize" }}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700" }}>TOTAL {side.toUpperCase()}</Text>
            <Text style={{ color: theme.text, fontSize: 28, fontWeight: "700", marginTop: 4 }}>{inr(total)}</Text>

            {rows.length === 0 && <Text style={{ color: theme.textMuted, marginTop: 16 }}>No data in this range.</Text>}

            {rows.length > 0 && (
              <>
                <View style={{ alignItems: "center", marginTop: 16 }}>
                  <PieChart data={rows.map((r: any) => ({ label: r.category, value: r.amount }))} size={Math.min(220, width - 110)} centerLabel="TOTAL" centerValue={inr(total)} />
                </View>

                <View style={{ marginTop: 24 }}>
                  <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginBottom: 12 }}>BY CATEGORY</Text>
                  <Svg width={barWidth} height={rows.length * (barH + 10)}>
                    {rows.map((r: any, i: number) => {
                      const w = (r.amount / maxVal) * (barWidth - 100);
                      const y = i * (barH + 10);
                      return (
                        <React.Fragment key={r.category}>
                          <Rect x={0} y={y} width={w} height={barH} rx={6} ry={6} fill={colors[i % colors.length]} />
                          <SvgText x={8} y={y + barH / 2 + 4} fontSize={12} fill={theme.background === "#09090B" ? "#000" : "#fff"} fontWeight="700">{r.category}</SvgText>
                          <SvgText x={barWidth - 8} y={y + barH / 2 + 4} fontSize={12} fill={theme.text} fontWeight="700" textAnchor="end">{inr(r.amount)}</SvgText>
                        </React.Fragment>
                      );
                    })}
                  </Svg>
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal transparent visible={showCustom} animationType="slide" onRequestClose={() => setShowCustom(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setShowCustom(false)} style={styles.backdrop}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: 20 + insets.bottom }]}>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Custom Date Range</Text>
            <Text style={{ color: theme.textMuted, marginTop: 6, fontSize: 13 }}>Pick exact start and end dates for the report.</Text>

            <Text style={[styles.label, { color: theme.textMuted }]}>START DATE</Text>
            <DateField value={customRange.start} onChange={(value) => setCustomRange((current) => ({ ...current, start: value }))} />

            <Text style={[styles.label, { color: theme.textMuted }]}>END DATE</Text>
            <DateField value={customRange.end} onChange={(value) => setCustomRange((current) => ({ ...current, end: value }))} />

            <TouchableOpacity testID="apply-custom-report-range" onPress={() => setShowCustom(false)} style={[styles.applyBtn, { backgroundColor: theme.primary }]}> 
              <Text style={{ color: theme.primaryText, fontWeight: "700" }}>Apply</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 20 },
  chip: { paddingHorizontal: 14, height: 32, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 999, borderWidth: 1, alignItems: "center" },
  card: { padding: 18, borderRadius: 22, borderWidth: 1, marginTop: 20 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1 },
  label: { fontSize: 11, letterSpacing: 2, fontWeight: "700", marginTop: 18, marginBottom: 8 },
  applyBtn: { marginTop: 20, paddingVertical: 14, borderRadius: 999, alignItems: "center" },
});
