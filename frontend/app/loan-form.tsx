import React, { useEffect, useState, useRef } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/contexts/ThemeContext";
import { api } from "@/src/api/client";
import { inr } from "@/src/constants/theme";
import { useCurrency } from "@/src/contexts/CurrencyContext";
import Screen from "@/src/components/Screen";
import DateField from "@/src/components/DateField";
import Checkbox from "@/src/components/Checkbox";
import PieChart from "@/src/components/PieChart";
import { toLocalYMD, formatLongDate as formatDateOnly } from "@/src/utils/date";
import { getInitials } from "@/src/utils/categoryIcons";

export default function LoanForm() {
  const { theme } = useTheme();
  const { currency } = useCurrency();
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
  const [autoCalculate, setAutoCalculate] = useState(true);
  const [calculatedFields, setCalculatedFields] = useState<Record<string, boolean>>({});
  const debounceRef = useRef<any>(null);

  const clearCalculated = (key: string) => setCalculatedFields((c) => (c[key] ? { ...c, [key]: false } : c));
  const onChangeTotal = (v: string) => { setTotal(v); clearCalculated("total"); };
  const onChangeInterest = (v: string) => { setInterest(v); clearCalculated("interest"); };
  const onChangeEmi = (v: string) => { setEmi(v); clearCalculated("emi"); };
  const onChangeTenure = (v: string) => { setTenure(v); clearCalculated("tenure"); };
  const onChangeTotalPayable = (v: string) => { setTotalPayable(v); clearCalculated("totalPayable"); };

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
  const numOrNull = (raw: string): number | null => {
    if (raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!autoCalculate) { setCalculatedFields({}); return; }
    debounceRef.current = setTimeout(async () => {
      const body: any = {
        total_amount: numOrNull(total),
        interest_rate: numOrNull(interest),
        emi: numOrNull(emi),
        tenure_months: numOrNull(tenure),
        total_payable: numOrNull(totalPayable),
        start_date: startDate || null,
      };
      // Only call once at least 2 values are known — any fewer can never pin
      // down the rest (see src/utils/loanMath.ts for which combos resolve).
      const known = ["total_amount", "interest_rate", "emi", "tenure_months", "total_payable"].filter((k) => body[k] !== null).length;
      if (known < 2) { setEndDate(""); setExtraInterest(null); setCalculatedFields({}); return; }
      try {
        const r = await api.post("/loans/compute", body);
        const calculated: Record<string, boolean> = {};
        if (r.total_amount != null && !total) { setTotal(String(Math.round(r.total_amount))); calculated.total = true; }
        if (r.interest_rate != null && !interest) { setInterest(String(r.interest_rate)); calculated.interest = true; }
        if (r.emi != null && !emi) { setEmi(String(Math.round(r.emi))); calculated.emi = true; }
        if (r.tenure_months != null && !tenure) { setTenure(String(r.tenure_months)); calculated.tenure = true; }
        if (r.total_payable != null && !totalPayable) { setTotalPayable(String(Math.round(r.total_payable))); calculated.totalPayable = true; }
        setCalculatedFields(calculated);
        setEndDate(r.end_date || "");
        setExtraInterest(r.extra_interest ?? null);
      } catch {}
    }, 400);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, interest, emi, tenure, totalPayable, startDate, autoCalculate]);

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

  const totalNum = parseFloat(total) || 0;
  const totalPayableNum = parseFloat(totalPayable) || 0;
  const interestAmount = Math.max(0, totalPayableNum - totalNum);
  const showSummary = totalNum > 0 && (parseFloat(emi) || 0) > 0 && (parseInt(tenure) || 0) > 0 && totalPayableNum > 0;

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.closeBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="close" size={20} color={theme.text} />
          </TouchableOpacity>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>{id ? "Edit" : "New"} Loan</Text>
          <TouchableOpacity testID="save-loan-btn" onPress={save} disabled={saving} style={[styles.saveBtn, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}>
            <Text style={{ color: theme.primaryText, fontWeight: "700" }}>{saving ? "Saving..." : "Save"}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Field label="MEMBER" icon="people-outline">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberRow}>
              {members.map((m) => {
                const selected = memberId === m.id;
                return (
                  <TouchableOpacity key={m.id} onPress={() => setMemberId(m.id)} testID={`loan-member-${m.id}`} style={styles.memberItem} activeOpacity={0.8}>
                    <View style={[styles.avatar, { backgroundColor: theme.surface, borderColor: selected ? theme.positive : theme.border, borderWidth: selected ? 2 : 1 }]}>
                      <Text style={{ color: m.color || theme.text, fontWeight: "700", fontSize: 15 }}>{getInitials(m.name)}</Text>
                      {selected && (
                        <View style={[styles.avatarCheck, { backgroundColor: theme.positive, borderColor: theme.background }]}>
                          <Ionicons name="checkmark" size={10} color="#fff" />
                        </View>
                      )}
                    </View>
                    <Text numberOfLines={1} style={{ color: selected ? theme.text : theme.textMuted, fontSize: 11, fontWeight: selected ? "700" : "600", marginTop: 6, maxWidth: 64, textAlign: "center" }}>{m.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Field>

          <Field label="NAME" icon="pricetag-outline"><TextInput testID="loan-name" value={name} onChangeText={setName} placeholder="e.g. Home Loan" placeholderTextColor={theme.textMuted} style={inputStyle(theme)} /></Field>

          <View style={[styles.hint, { backgroundColor: theme.primary + "14", borderColor: theme.primary + "33" }]}>
            <Ionicons name="sparkles-outline" size={15} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Checkbox
                testID="auto-calculate-toggle"
                value={autoCalculate}
                onChange={setAutoCalculate}
                label={"Fill in any two of the fields below \u2014 the rest calculate automatically."}
              />
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Field label={`TOTAL AMOUNT (${currency.symbol})`} icon="cash-outline" calculated={calculatedFields.total}>
                <TextInput testID="loan-total" keyboardType="decimal-pad" value={total} onChangeText={onChangeTotal} placeholder="Principal" placeholderTextColor={theme.textMuted} style={inputStyle(theme, calculatedFields.total, theme.primary)} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="INTEREST % (annual)" icon="trending-up-outline" calculated={calculatedFields.interest}>
                <TextInput keyboardType="decimal-pad" value={interest} onChangeText={onChangeInterest} placeholder="e.g. 9.5" placeholderTextColor={theme.textMuted} style={inputStyle(theme, calculatedFields.interest, theme.primary)} />
              </Field>
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Field label={`EMI (${currency.symbol})`} icon="repeat-outline" calculated={calculatedFields.emi}>
                <TextInput testID="loan-emi" keyboardType="decimal-pad" value={emi} onChangeText={onChangeEmi} placeholder="Monthly EMI" placeholderTextColor={theme.textMuted} style={inputStyle(theme, calculatedFields.emi, theme.primary)} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="TENURE (months)" icon="calendar-outline" calculated={calculatedFields.tenure}>
                <TextInput keyboardType="number-pad" value={tenure} onChangeText={onChangeTenure} placeholder="e.g. 240" placeholderTextColor={theme.textMuted} style={inputStyle(theme, calculatedFields.tenure, theme.primary)} />
              </Field>
            </View>
          </View>

          <Field label={`TOTAL PAYABLE (${currency.symbol}) \u00B7 optional`} icon="wallet-outline" calculated={calculatedFields.totalPayable}>
            <TextInput keyboardType="decimal-pad" value={totalPayable} onChangeText={onChangeTotalPayable} placeholder="EMI × tenure" placeholderTextColor={theme.textMuted} style={inputStyle(theme, calculatedFields.totalPayable, theme.primary)} />
          </Field>

          <Field label="START DATE" icon="calendar-clear-outline"><DateField value={startDate} onChange={setStartDate} /></Field>

          <View style={{ marginTop: 20 }}>
            <Checkbox testID="mark-paid-till-now" value={markPaidTillNow} onChange={setMarkPaidTillNow} label="All EMIs paid till this month (auto-record backdated payments)" />
          </View>

          {showSummary && (
            <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 }}>
                <Ionicons name="receipt-outline" size={14} color={theme.textMuted} />
                <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700" }}>LOAN SUMMARY</Text>
              </View>

              <PieChart
                size={170}
                centerLabel="TOTAL PAYABLE"
                centerValue={inr(totalPayableNum)}
                data={[
                  { label: "Principal", value: totalNum, color: theme.primary },
                  { label: "Interest", value: interestAmount, color: theme.negative },
                ]}
              />

              <View style={{ marginTop: 4, alignSelf: "stretch" }}>
                <SummaryRow icon="calendar-outline" label="Start date" value={formatDateOnly(startDate)} theme={theme} />
                {endDate ? <SummaryRow icon="flag-outline" label="End date" value={formatDateOnly(endDate)} theme={theme} /> : null}
                <SummaryRow icon="cash-outline" label="Total payable" value={inr(totalPayableNum)} theme={theme} />
                <SummaryRow icon="trending-up-outline" label="Total interest" value={inr(interestAmount)} theme={theme} last={!(extraInterest !== null && extraInterest > 0)} />
                {extraInterest !== null && extraInterest > 0 ? (
                  <SummaryRow icon="alert-circle-outline" label="Extra interest paid" value={inr(extraInterest)} theme={theme} last />
                ) : null}
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({ label, icon, calculated, children }: any) {
  const { theme } = useTheme();
  return (
    <View style={{ marginTop: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
        {icon && <Ionicons name={icon} size={13} color={theme.textMuted} />}
        <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700" }}>{label}</Text>
        {calculated && (
          <View style={[styles.autoBadge, { backgroundColor: theme.primary + "22" }]}>
            <Ionicons name="sparkles" size={10} color={theme.primary} />
            <Text style={{ color: theme.primary, fontSize: 9, fontWeight: "700" }}>AUTO</Text>
          </View>
        )}
      </View>
      {children}
    </View>
  );
}
function SummaryRow({ icon, label, value, theme, last }: any) {
  return (
    <View style={[styles.summaryRow, !last && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name={icon} size={14} color={theme.textMuted} />
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>{label}</Text>
      </View>
      <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13 }}>{value}</Text>
    </View>
  );
}
const inputStyle = (theme: any, calculated?: boolean, accent?: string) => ({
  borderWidth: 1,
  borderRadius: 14,
  paddingHorizontal: 16,
  paddingVertical: 14,
  fontSize: 16,
  color: theme.text,
  borderColor: calculated && accent ? accent + "55" : theme.border,
  backgroundColor: calculated && accent ? accent + "0F" : theme.surface,
  minHeight: 52,
});
const styles = StyleSheet.create({
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 20, borderBottomWidth: 1 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  saveBtn: { paddingHorizontal: 18, height: 36, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  hint: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, padding: 12, borderRadius: 14, borderWidth: 1 },
  fieldRow: { flexDirection: "row", gap: 12 },
  autoBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, height: 16, borderRadius: 8 },
  summaryCard: { marginTop: 24, padding: 18, borderRadius: 22, borderWidth: 1, alignItems: "center" },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", alignSelf: "stretch", paddingVertical: 10 },
  memberRow: { flexDirection: "row", gap: 16, paddingRight: 8 },
  memberItem: { alignItems: "center" },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  avatarCheck: { position: "absolute", right: -2, bottom: -2, width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 2 },
});
