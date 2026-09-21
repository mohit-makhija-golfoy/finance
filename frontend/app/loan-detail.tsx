import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/contexts/ThemeContext";
import { api } from "@/src/api/client";
import { inrFull, inr } from "@/src/constants/theme";
import Screen from "@/src/components/Screen";
import { confirmAction } from "@/src/utils/confirm";
import { toLocalYMD, formatLongDate, formatDateTime } from "@/src/utils/date";

export default function LoanDetail() {
  const { theme } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loan, setLoan] = useState<any>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoan(await api.get(`/loans/${id}`));
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!loan) return <Screen><View /></Screen>;

  const payments = (loan.payments || []).slice().reverse();
  const installmentTimeline = (loan.expected_installments || []).slice();
  const expectedAhead = (loan.expected_paid_to_date || 0) > (loan.total_paid || 0);
  const displayPaid = expectedAhead ? (loan.expected_paid_to_date || 0) : (loan.total_paid || 0);
  const displayRemaining = expectedAhead
    ? (loan.expected_remaining ?? loan.remaining_payable ?? loan.remaining_balance ?? 0)
    : (loan.remaining_payable ?? loan.remaining_balance ?? 0);
  const progressBase = loan.total_payable ?? loan.total_amount ?? 0;
  const progress = progressBase > 0 ? Math.min(1, displayPaid / progressBase) : 0;

  const catchUp = () => {
    confirmAction(
      "Catch up to today?",
      `Record ${inr(Math.round(loan.expected_paid_to_date - loan.total_paid))} as a backdated EMI lump (recommended for loans imported mid-tenure).`,
      "Record",
      async () => {
        const delta = (loan.expected_paid_to_date || 0) - (loan.total_paid || 0);
        if (delta > 0) {
          await api.post(`/loans/${id}/payment`, { amount: delta, date: toLocalYMD(new Date()), type: "emi", notes: "Backdated catch-up" });
          load();
        }
      }
    );
  };

  const close = () => {
    confirmAction("Close loan?", "Mark as fully closed.", "Close", async () => {
      await api.post(`/loans/${id}/close`);
      load();
    });
  };

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 200 }} keyboardShouldPersistTaps="handled">
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={theme.text} /></TouchableOpacity>
            <TouchableOpacity testID="edit-loan-btn" onPress={() => router.push({ pathname: "/loan-form", params: { id } })}>
              <Ionicons name="create-outline" size={22} color={theme.text} />
            </TouchableOpacity>
          </View>

          <View style={{ padding: 24 }}>
            <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700" }}>LOAN • {loan.status?.toUpperCase()}</Text>
            <Text style={{ color: theme.text, fontSize: 30, fontWeight: "700", letterSpacing: -0.5, marginTop: 6 }}>{loan.name}</Text>
            <Text style={{ color: theme.text, fontSize: 32, fontWeight: "700", marginTop: 20 }}>{inrFull(displayRemaining)}</Text>
            <Text style={{ color: theme.textMuted, marginTop: 4 }}>remaining of {inrFull(loan.total_payable ?? loan.total_amount)}</Text>

            <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
              <View style={[styles.progressFill, { backgroundColor: theme.positive, width: `${progress * 100}%` }]} />
            </View>

            {expectedAhead && loan.status === "active" && (
              <TouchableOpacity testID="catchup-btn" onPress={catchUp} style={[styles.banner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Ionicons name="time-outline" size={18} color={theme.text} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: "700" }}>Loan is {loan.months_elapsed} mo old</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                    Expected till last month: {inr((loan.installments_gone_before_current || 0) * (loan.emi || 0))}. Current month can be paid from reminder.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            )}

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Row label="EMI" value={inr(loan.emi)} />
              <Row label="Interest" value={`${loan.interest_rate}%`} />
              <Row label="Tenure" value={`${loan.tenure_months} months`} />
              <Row label="Principal" value={inr(loan.total_amount)} />
              <Row label="Total payable" value={inr(loan.total_payable ?? loan.total_amount)} />
              <Row label="Installments gone" value={`${loan.installments_gone_before_current || 0}${loan.current_month_paid ? " + current" : ""}`} />
              <Row label={expectedAhead ? "Paid (expected)" : "Paid"} value={inr(displayPaid)} />
              {expectedAhead && (loan.total_paid || 0) > 0 ? <Row label="Actually recorded" value={inr(loan.total_paid)} /> : null}
              <Row label="Start" value={formatLongDate(loan.start_date)} />
              {loan.end_date && <Row label="End" value={formatLongDate(loan.end_date)} />}
            </View>

            {installmentTimeline.length > 0 && (
              <View style={{ marginTop: 24 }}>
                <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginBottom: 8 }}>INSTALLMENT TIMELINE</Text>
                {installmentTimeline.map((item: any, index: number) => (
                  <View key={`${item.month_key}-${index}`} style={[styles.payRow, { borderBottomColor: theme.border }]}> 
                    <View>
                      <Text style={{ color: theme.text, fontWeight: "600" }}>{formatLongDate(item.date)}</Text>
                      <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                        {item.status === "recorded" ? "Recorded" : "Expected"}
                      </Text>
                    </View>
                    <Text style={{ color: theme.text, fontWeight: "700" }}>{inr(item.amount)}</Text>
                  </View>
                ))}
              </View>
            )}

            {payments.length > 0 && (
              <View style={{ marginTop: 24 }}>
                <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginBottom: 8 }}>PAYMENT HISTORY</Text>
                {payments.map((p: any) => (
                  <View key={p.id} style={[styles.payRow, { borderBottomColor: theme.border }]}>
                    <View>
                      <Text style={{ color: theme.text, fontWeight: "600" }}>{p.type.toUpperCase()}</Text>
                      <Text style={{ color: theme.textMuted, fontSize: 12 }}>{formatLongDate(p.date)}</Text>
                      {p.created_at && <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>Recorded {formatDateTime(p.created_at)}</Text>}
                    </View>
                    <Text style={{ color: theme.text, fontWeight: "700" }}>{inr(p.amount)}</Text>
                  </View>
                ))}
              </View>
            )}

            {loan.status === "active" && (
              <TouchableOpacity testID="close-loan-btn" onPress={close} style={[styles.btnFull, { borderColor: theme.negative }]}>
                <Text style={{ color: theme.negative, fontWeight: "700" }}>Close Loan</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity testID="delete-loan-btn" onPress={() => {
              confirmAction("Delete?", "Permanently remove this loan and its payment history?", "Delete", async () => {
                await api.del(`/loans/${id}`);
                router.back();
              });
            }} style={[styles.btnFull, { borderColor: theme.border, marginTop: 10 }]}>
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
  return (<View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 10 }}><Text style={{ color: theme.textMuted }}>{label}</Text><Text style={{ color: theme.text, fontWeight: "600" }}>{value}</Text></View>);
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", justifyContent: "space-between", padding: 16, paddingTop: 20 },
  progressTrack: { height: 8, borderRadius: 4, marginTop: 20, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  banner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, marginTop: 16 },
  card: { padding: 16, borderRadius: 20, borderWidth: 1, marginTop: 20 },
  btnFull: { marginTop: 20, padding: 16, borderRadius: 999, borderWidth: 1, alignItems: "center" },
  payRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1 },
});
