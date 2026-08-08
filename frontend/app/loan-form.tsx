import React, { useEffect, useState, useRef } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/contexts/ThemeContext";
import { api } from "@/src/api/client";
import { inr } from "@/src/constants/theme";
import Screen from "@/src/components/Screen";
import DateField from "@/src/components/DateField";
import Checkbox from "@/src/components/Checkbox";
import { toLocalYMD } from "@/src/utils/date";

export default function LoanForm() {
  const { theme } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [name, setName] = useState("");
  const [total, setTotal] = useState("");
  const [interest, setInterest] = useState("");
  const [emi, setEmi] = useState("");
  const [tenure, setTenure] = useState("");
  const [totalPayable, setTotalPayable] = useState("");
  const [startDate, setStartDate] = useState(toLocalYMD(new Date()));
  const [endDate, setEndDate] = useState("");
  const [extraInterest, setExtraInterest] = useState<number | null>(null);
  const [memberId, setMemberId] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [markPaidTillNow, setMarkPaidTillNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      const m = await api.get("/members");
      setMembers(m);
      if (!memberId && m[0]) setMemberId(m[0].id);
      if (id) {
        const l = await api.get(`/loans/${id}`);
        setName(l.name); setTotal(String(l.total_amount)); setInterest(String(l.interest_rate));
        setEmi(String(l.emi)); setTenure(String(l.tenure_months));
        setStartDate(l.start_date); setMemberId(l.member_id);
      }
    })();
  }, [id]);

  // Auto-calc debounced
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const body: any = {
        total_amount: parseFloat(total) || null,
        interest_rate: parseFloat(interest) || null,
        emi: parseFloat(emi) || null,
        tenure_months: parseInt(tenure) || null,
        total_payable: parseFloat(totalPayable) || null,
        start_date: startDate || null,
      };
      // Only call if at least 2 known
      const known = ["total_amount", "interest_rate", "emi", "tenure_months", "total_payable"].filter((k) => body[k]).length;
      if (known < 2) { setEndDate(""); setExtraInterest(null); return; }
      try {
        const r = await api.post("/loans/compute", body);
        if (r.total_amount && !total) setTotal(String(Math.round(r.total_amount)));
        if (r.interest_rate && !interest) setInterest(String(r.interest_rate));
        if (r.emi && !emi) setEmi(String(r.emi));
        if (r.tenure_months && !tenure) setTenure(String(r.tenure_months));
        if (r.total_payable && !totalPayable) setTotalPayable(String(Math.round(r.total_payable)));
        setEndDate(r.end_date || "");
        setExtraInterest(r.extra_interest || null);
      } catch {}
    }, 400);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, interest, emi, tenure, totalPayable, startDate]);

  const save = async () => {
    if (!name || !total || !emi || !memberId) {
      Alert.alert("Missing info", "Name, total amount, EMI and member are required.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name, member_id: memberId,
        total_amount: parseFloat(total) || 0,
        interest_rate: parseFloat(interest) || 0,
        emi: parseFloat(emi) || 0,
        tenure_months: parseInt(tenure) || 0,
        start_date: startDate,
      };
      let savedLoan: any;
      if (id) savedLoan = await api.put(`/loans/${id}`, body);
      else savedLoan = await api.post("/loans", body);
      const loanId = id || savedLoan?.id;
      if (markPaidTillNow && loanId) {
        try { await api.post(`/loans/${loanId}/mark_paid_till_now`, {}); } catch {}
      }
      router.back();
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to save loan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="close" size={24} color={theme.text} /></TouchableOpacity>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>{id ? "Edit" : "New"} Loan</Text>
          <TouchableOpacity testID="save-loan-btn" onPress={save} disabled={saving}><Text style={{ color: theme.text, fontWeight: "700", opacity: saving ? 0.5 : 1 }}>{saving ? "Saving..." : "Save"}</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Field label="NAME"><TextInput testID="loan-name" value={name} onChangeText={setName} placeholder="e.g. Home Loan" placeholderTextColor={theme.textMuted} style={inputStyle(theme)} /></Field>

          <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 24, fontStyle: "italic" }}>
            Enter any 2-3 fields. Missing values auto-calculate.
          </Text>

          <Field label="TOTAL AMOUNT (\u20B9)"><TextInput testID="loan-total" keyboardType="decimal-pad" value={total} onChangeText={setTotal} placeholder="Principal" placeholderTextColor={theme.textMuted} style={inputStyle(theme)} /></Field>
          <Field label="INTEREST RATE % (annual)"><TextInput keyboardType="decimal-pad" value={interest} onChangeText={setInterest} placeholder="e.g. 9.5" placeholderTextColor={theme.textMuted} style={inputStyle(theme)} /></Field>
          <Field label="EMI (\u20B9)"><TextInput testID="loan-emi" keyboardType="decimal-pad" value={emi} onChangeText={setEmi} placeholder="Monthly EMI" placeholderTextColor={theme.textMuted} style={inputStyle(theme)} /></Field>
          <Field label="TENURE (months)"><TextInput keyboardType="number-pad" value={tenure} onChangeText={setTenure} placeholder="e.g. 240" placeholderTextColor={theme.textMuted} style={inputStyle(theme)} /></Field>
          <Field label="TOTAL PAYABLE (\u20B9) optional"><TextInput keyboardType="decimal-pad" value={totalPayable} onChangeText={setTotalPayable} placeholder="EMI \u00D7 tenure" placeholderTextColor={theme.textMuted} style={inputStyle(theme)} /></Field>
          <Field label="START DATE"><DateField value={startDate} onChange={setStartDate} /></Field>

          <View style={{ marginTop: 16 }}>
            <Checkbox testID="mark-paid-till-now" value={markPaidTillNow} onChange={setMarkPaidTillNow} label="All EMIs paid till this month (auto-record backdated payments)" />
          </View>

          {(endDate || extraInterest !== null) && (
            <View style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {endDate ? <Row label="Ends on" value={endDate} /> : null}
              {extraInterest !== null && extraInterest > 0 ? <Row label="Extra interest paid" value={inr(extraInterest)} /> : null}
            </View>
          )}

          <Field label="MEMBER">
            <View style={styles.chipRow}>
              {members.map((m) => (
                <TouchableOpacity key={m.id} onPress={() => setMemberId(m.id)} testID={`loan-member-${m.id}`}
                  style={[styles.chip, { backgroundColor: memberId === m.id ? theme.primary : theme.surface, borderColor: memberId === m.id ? theme.primary : theme.border }]}>
                  <Text style={{ color: memberId === m.id ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12 }}>{m.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({ label, children }: any) {
  const { theme } = useTheme();
  return (<View style={{ marginTop: 20 }}><Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginBottom: 8 }}>{label}</Text>{children}</View>);
}
function Row({ label, value }: any) {
  const { theme } = useTheme();
  return (<View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 }}><Text style={{ color: theme.textMuted }}>{label}</Text><Text style={{ color: theme.text, fontWeight: "600" }}>{value}</Text></View>);
}
const inputStyle = (theme: any) => ({ borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: theme.text, borderColor: theme.border, backgroundColor: theme.surface, minHeight: 52 });
const styles = StyleSheet.create({
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 20 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  summary: { marginTop: 16, padding: 14, borderRadius: 16, borderWidth: 1 },
});
