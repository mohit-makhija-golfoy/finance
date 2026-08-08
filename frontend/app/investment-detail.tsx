import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, useWindowDimensions, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/contexts/ThemeContext";
import { api } from "@/src/api/client";
import { inrFull, inr } from "@/src/constants/theme";
import Screen from "@/src/components/Screen";
import MiniLineChart from "@/src/components/MiniLineChart";
import Checkbox from "@/src/components/Checkbox";
import DateField from "@/src/components/DateField";
import { toLocalYMD } from "@/src/utils/date";

export default function InvestmentDetail() {
  const { theme } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inv, setInv] = useState<any>(null);
  const [newValue, setNewValue] = useState("");
  const [valueDate, setValueDate] = useState(toLocalYMD(new Date()));
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [withdrawDate, setWithdrawDate] = useState(toLocalYMD(new Date()));
  const [addToIncome, setAddToIncome] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const d = await api.get(`/investments/${id}`);
    setInv(d);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!inv) return <Screen><View /></Screen>;

  const pl = inv.profit_loss || 0;
  const history = (inv.value_history || [])
    .slice()
    .sort((a: any, b: any) => getSortTime(a) - getSortTime(b));
  const chartData = history.map((h: any) => ({ x: h.date, y: h.current_value }));
  const withdrawals = (inv.withdrawals || []).slice().reverse();

  const addValue = async () => {
    if (!newValue) return;
    try {
      await api.post(`/investments/${id}/value`, { date: valueDate, current_value: parseFloat(newValue) });
      setNewValue("");
      load();
    } catch (error) {
      Alert.alert("Update failed", error instanceof Error ? error.message : "Failed to save value update");
    }
  };

  const withdraw = async () => {
    if (!withdrawAmt) return;
    try {
      await api.post(`/investments/${id}/withdraw`, {
        amount: parseFloat(withdrawAmt),
        date: withdrawDate,
        add_to_income: addToIncome,
        category: "Investment Withdrawal",
      });
      setWithdrawAmt("");
      load();
    } catch (error) {
      Alert.alert("Withdrawal failed", error instanceof Error ? error.message : "Failed to withdraw");
    }
  };

  const doClose = async () => {
    try {
      await api.post(`/investments/${id}/close`);
      await load();
      Alert.alert("Closed", "Investment marked as closed.");
    } catch (error) {
      Alert.alert("Close failed", error instanceof Error ? error.message : "Failed to close investment");
    }
  };

  const close = () => {
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      const ok = window.confirm("Mark this investment as fully closed?");
      if (ok) void doClose();
      return;
    }

    Alert.alert("Close investment?", "Mark as fully closed.", [
      { text: "Cancel" },
      { text: "Close", style: "destructive", onPress: () => { void doClose(); } },
    ]);
  };

  const doDelete = async () => {
    try {
      await api.del(`/investments/${id}`);
      router.back();
    } catch (error) {
      Alert.alert("Delete failed", error instanceof Error ? error.message : "Failed to delete investment");
    }
  };

  const confirmDelete = () => {
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      const ok = window.confirm("Permanently remove this investment and its history?");
      if (ok) void doDelete();
      return;
    }

    Alert.alert("Delete?", "Permanently remove this investment and its history?", [
      { text: "Cancel" },
      { text: "Delete", style: "destructive", onPress: () => { void doDelete(); } },
    ]);
  };

  const expectedDisplay = inv.expected_return
    ? inv.expected_return_type === "amount" ? inrFull(inv.expected_return) : `${inv.expected_return}%`
    : "—";

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }} keyboardVerticalOffset={0}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 200 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={theme.text} /></TouchableOpacity>
            <TouchableOpacity testID="edit-inv-btn" onPress={() => router.push({ pathname: "/investment-form", params: { id } })}>
              <Ionicons name="create-outline" size={22} color={theme.text} />
            </TouchableOpacity>
          </View>

          <View style={{ padding: 24 }}>
            <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700" }}>{inv.type?.toUpperCase()} • {inv.status?.toUpperCase()}</Text>
            <Text style={{ color: theme.text, fontSize: 30, fontWeight: "700", letterSpacing: -0.5, marginTop: 6 }}>{inv.name}</Text>
            <Text style={{ color: theme.text, fontSize: 32, fontWeight: "700", marginTop: 20 }}>{inrFull(inv.current_value || 0)}</Text>
            <Text style={{ color: pl >= 0 ? theme.positive : theme.negative, fontWeight: "700", marginTop: 4 }}>{pl >= 0 ? "+" : ""}{inr(pl)} P/L</Text>

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700" }}>VALUE OVER TIME</Text>
              <View style={{ marginTop: 12 }}>
                {chartData.length > 0 ? <MiniLineChart data={chartData} width={width - 96} height={150} showAxis /> : <Text style={{ color: theme.textMuted, marginTop: 12 }}>No history yet. Add a value update.</Text>}
              </View>
            </View>

            <Row label="Invested" value={inr(inv.total_invested || 0)} />
            <Row label="Start" value={inv.start_date} />
            {inv.maturity_date && <Row label="Maturity" value={inv.maturity_date} />}
            <Row label="Expected Return" value={expectedDisplay} />

            {inv.type !== "onetime" && (
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700" }}>UPDATE CURRENT VALUE</Text>
                <DateField value={valueDate} onChange={setValueDate} />
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <TextInput testID="new-value-input" keyboardType="decimal-pad" value={newValue} onChangeText={setNewValue} placeholder="0" placeholderTextColor={theme.textMuted} style={[inputStyle(theme), { flex: 1 }]} />
                  <TouchableOpacity testID="add-value-btn" onPress={addValue} style={[styles.btn, { backgroundColor: theme.primary }]}><Text style={{ color: theme.primaryText, fontWeight: "700" }}>Add</Text></TouchableOpacity>
                </View>
                {inv.type === "recurring" && (
                  <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 8, fontStyle: "italic" }}>Tip: subsequent SIP payments are added on top of the last entered value.</Text>
                )}
              </View>
            )}

            {inv.type === "onetime" && inv.status === "active" && (
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700" }}>PARTIAL WITHDRAWAL</Text>
                <View style={{ marginTop: 12 }}>
                  <DateField value={withdrawDate} onChange={setWithdrawDate} />
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <TextInput testID="withdraw-input" keyboardType="decimal-pad" value={withdrawAmt} onChangeText={setWithdrawAmt} placeholder="0" placeholderTextColor={theme.textMuted} style={[inputStyle(theme), { flex: 1 }]} />
                  <TouchableOpacity testID="withdraw-btn" onPress={withdraw} style={[styles.btn, { backgroundColor: theme.primary }]}><Text style={{ color: theme.primaryText, fontWeight: "700" }}>Withdraw</Text></TouchableOpacity>
                </View>
                <View style={{ marginTop: 10 }}>
                  <Checkbox testID="add-to-income-checkbox" value={addToIncome} onChange={setAddToIncome} label="Add withdrawn amount to Income (recommended)" />
                </View>
              </View>
            )}

            {withdrawals.length > 0 && (
              <View style={{ marginTop: 24 }}>
                <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginBottom: 8 }}>WITHDRAWAL HISTORY</Text>
                {withdrawals.map((w: any) => (
                  <View key={w.id} testID={`wd-row-${w.id}`} style={[styles.payRow, { borderBottomColor: theme.border }]}>
                    <View>
                      <Text style={{ color: theme.text, fontWeight: "600" }}>{formatDateTime(w.date, w.created_at)}</Text>
                      {w.income_tx_id && <Text style={{ color: theme.positive, fontSize: 11, marginTop: 2 }}>↳ added to income</Text>}
                    </View>
                    <Text style={{ color: theme.text, fontWeight: "700" }}>{inr(w.amount)}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={{ marginTop: 24 }}>
              <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginBottom: 8 }}>VALUE HISTORY</Text>
              {history.length === 0 ? (
                <Text style={{ color: theme.textMuted }}>No value updates yet.</Text>
              ) : (
                history.slice().reverse().map((h: any, index: number) => (
                  <View key={`${h.id || h.date}-${index}`} testID={`vh-row-${h.id || index}`} style={[styles.payRow, { borderBottomColor: theme.border }]}> 
                    <Text style={{ color: theme.text, fontWeight: "600" }}>{formatDateTime(h.date, h.created_at)}</Text>
                    <Text style={{ color: theme.text, fontWeight: "700" }}>{inr(h.current_value || 0)}</Text>
                  </View>
                ))
              )}
            </View>

            {inv.status === "active" && (
              <TouchableOpacity testID="close-inv-btn" onPress={close} style={[styles.btnFull, { borderColor: theme.negative }]}>
                <Text style={{ color: theme.negative, fontWeight: "700" }}>Close Investment</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity testID="delete-inv-btn" onPress={confirmDelete} style={[styles.btnFull, { borderColor: theme.border, marginTop: 10 }]}>
              <Text style={{ color: theme.negative, fontWeight: "700" }}>Delete permanently</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Row({ label, value }: any) {
  const { theme } = useTheme();
  return (<View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.border }}><Text style={{ color: theme.textMuted }}>{label}</Text><Text style={{ color: theme.text, fontWeight: "600" }}>{value}</Text></View>);
}

function getSortTime(item: any) {
  const created = item?.created_at ? new Date(item.created_at).getTime() : Number.NaN;
  if (!Number.isNaN(created)) return created;
  const dateOnly = item?.date ? new Date(`${item.date}T00:00:00`).getTime() : Number.NaN;
  return Number.isNaN(dateOnly) ? 0 : dateOnly;
}

function formatDateTime(date?: string, createdAt?: string) {
  const raw = createdAt || (date ? `${date}T00:00:00` : "");
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return date || "-";
  return d.toLocaleString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

const inputStyle = (theme: any) => ({ borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: theme.text, borderColor: theme.border, backgroundColor: theme.surface, minHeight: 52 });
const styles = StyleSheet.create({
  topBar: { flexDirection: "row", justifyContent: "space-between", padding: 16, paddingTop: 20 },
  card: { padding: 16, borderRadius: 20, borderWidth: 1, marginTop: 20 },
  btn: { paddingHorizontal: 18, justifyContent: "center", borderRadius: 14 },
  btnFull: { marginTop: 20, padding: 16, borderRadius: 999, borderWidth: 1, alignItems: "center" },
  payRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1 },
});
