import React, { useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, Modal } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/contexts/ThemeContext";
import { useCurrency } from "@/src/contexts/CurrencyContext";
import { api } from "@/src/api/client";
import Screen from "@/src/components/Screen";
import DateField from "@/src/components/DateField";
import { toLocalYMD } from "@/src/utils/date";
import { getInitials } from "@/src/utils/categoryIcons";

type DurationUnit = "days" | "months" | "years";

const DURATION_UNITS: { key: DurationUnit; label: string }[] = [
  { key: "days", label: "Days" },
  { key: "months", label: "Months" },
  { key: "years", label: "Years" },
];

function addDuration(startDateStr: string, value: string, unit: DurationUnit): string | null {
  const n = parseInt(value, 10);
  if (!n) return null;
  const d = new Date(`${startDateStr}T00:00:00`);
  if (unit === "days") d.setDate(d.getDate() + n);
  else if (unit === "months") d.setMonth(d.getMonth() + n);
  else d.setFullYear(d.getFullYear() + n);
  return toLocalYMD(d);
}

function durationFromDates(startDateStr: string, endDateStr: string): { value: string; unit: DurationUnit } {
  const start = new Date(`${startDateStr}T00:00:00`);
  const end = new Date(`${endDateStr}T00:00:00`);
  const diffDays = Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000));
  if (diffDays <= 0) return { value: "", unit: "months" };
  const years = diffDays / 365.25;
  if (Math.abs(years - Math.round(years)) < 0.02 && Math.round(years) > 0) {
    return { value: String(Math.round(years)), unit: "years" };
  }
  const months = diffDays / 30.437;
  if (Math.abs(months - Math.round(months)) < 0.05 && Math.round(months) > 0) {
    return { value: String(Math.round(months)), unit: "months" };
  }
  return { value: String(diffDays), unit: "days" };
}

export default function InvestmentForm() {
  const { theme } = useTheme();
  const { currency } = useCurrency();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [name, setName] = useState("");
  const [type, setType] = useState<"onetime" | "recurring">("onetime");
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState(toLocalYMD(new Date()));
  const [durationValue, setDurationValue] = useState("");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("months");
  const [expectedReturn, setExpectedReturn] = useState("");
  const [returnType, setReturnType] = useState<"percent" | "amount">("percent");
  const [memberId, setMemberId] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const m = await api.get("/members");
      setMembers(m);
      if (!memberId && m[0]) setMemberId(m[0].id);
      if (id) {
        const inv = await api.get(`/investments/${id}`);
        setName(inv.name); setType(inv.type); setAmount(String(inv.amount));
        setStartDate(inv.start_date);
        if (inv.maturity_date && inv.start_date) {
          const d = durationFromDates(inv.start_date, inv.maturity_date);
          setDurationValue(d.value); setDurationUnit(d.unit);
        }
        setExpectedReturn(String(inv.expected_return || ""));
        setReturnType(inv.expected_return_type || "percent");
        setMemberId(inv.member_id);
      }
    })();
  }, [id]);

  const save = async () => {
    if (!name || !amount || !memberId) {
      Alert.alert("Missing info", "Name, amount and member are required.");
      return;
    }
    setSaving(true);
    try {
      const body: any = {
        name, type, member_id: memberId,
        amount: parseFloat(amount) || 0,
        start_date: startDate,
        maturity_date: type === "onetime" ? addDuration(startDate, durationValue, durationUnit) : null,
        expected_return: parseFloat(expectedReturn) || null,
        expected_return_type: returnType,
      };
      if (id) await api.put(`/investments/${id}`, body);
      else await api.post("/investments", body);
      router.back();
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to save investment");
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
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>{id ? "Edit" : "New"} Investment</Text>
          <TouchableOpacity testID="save-inv-btn" onPress={save} disabled={saving}><Text style={{ color: theme.text, fontWeight: "700", opacity: saving ? 0.5 : 1 }}>{saving ? "Saving..." : "Save"}</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Field label="NAME"><TextInput testID="inv-name" value={name} onChangeText={setName} placeholder="e.g. SBI Bluechip SIP" placeholderTextColor={theme.textMuted} style={inputStyle(theme)} /></Field>

          <Field label="TYPE">
            <View style={styles.chipRow}>
              {(["onetime", "recurring"] as const).map((t) => (
                <TouchableOpacity key={t} testID={`inv-type-${t}`} onPress={() => setType(t)}
                  style={[styles.chip, { backgroundColor: type === t ? theme.primary : theme.surface, borderColor: type === t ? theme.primary : theme.border }]}>
                  <Text style={{ color: type === t ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12, textTransform: "capitalize" }}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          <Field label={type === "recurring" ? `MONTHLY AMOUNT (${currency.symbol})` : `AMOUNT INVESTED (${currency.symbol})`}>
            <TextInput testID="inv-amount" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0" placeholderTextColor={theme.textMuted} style={inputStyle(theme)} />
          </Field>

          <Field label="MEMBER">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberRow}>
              {members.map((m) => {
                const selected = memberId === m.id;
                return (
                  <TouchableOpacity key={m.id} onPress={() => setMemberId(m.id)} testID={`inv-member-${m.id}`} style={styles.memberItem} activeOpacity={0.8}>
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

          <Field label="START DATE">
            <DateField testID="inv-start-date" value={startDate} onChange={setStartDate} />
          </Field>

          {type === "onetime" && (
            <Field label="DURATION (optional)">
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  testID="inv-duration-value"
                  keyboardType="number-pad"
                  value={durationValue}
                  onChangeText={setDurationValue}
                  placeholder="e.g. 12"
                  placeholderTextColor={theme.textMuted}
                  style={[inputStyle(theme), { flex: 1 }]}
                />
                <View style={{ flex: 1 }}>
                  <UnitDropdown value={durationUnit} onChange={setDurationUnit} theme={theme} />
                </View>
              </View>
            </Field>
          )}

          <Field label="EXPECTED RETURN (optional)">
            <View style={[styles.chipRow, { marginBottom: 8 }]}>
              {(["percent", "amount"] as const).map((rt) => (
                <TouchableOpacity key={rt} testID={`ret-${rt}`} onPress={() => setReturnType(rt)}
                  style={[styles.chip, { backgroundColor: returnType === rt ? theme.primary : theme.surface, borderColor: returnType === rt ? theme.primary : theme.border }]}>
                  <Text style={{ color: returnType === rt ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12 }}>{rt === "percent" ? "% Rate" : `Total ${currency.symbol} on Maturity`}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput keyboardType="decimal-pad" value={expectedReturn} onChangeText={setExpectedReturn}
              placeholder={returnType === "percent" ? "e.g. 12 (percent)" : `e.g. 150000 (total amount you'll receive)`}
              placeholderTextColor={theme.textMuted} style={inputStyle(theme)} />
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

function UnitDropdown({ value, onChange, theme }: { value: DurationUnit; onChange: (v: DurationUnit) => void; theme: any }) {
  const [open, setOpen] = useState(false);
  const label = DURATION_UNITS.find((o) => o.key === value)?.label || "Months";
  return (
    <>
      <TouchableOpacity
        testID="inv-duration-unit"
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        style={[inputStyle(theme), { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
      >
        <Text style={{ color: theme.text, fontSize: 16 }}>{label}</Text>
        <Ionicons name="chevron-down" size={18} color={theme.textMuted} />
      </TouchableOpacity>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setOpen(false)} style={ddStyles.backdrop}>
          <View style={[ddStyles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {DURATION_UNITS.map((o) => (
              <TouchableOpacity
                key={o.key}
                testID={`inv-duration-unit-${o.key}`}
                onPress={() => { onChange(o.key); setOpen(false); }}
                style={[ddStyles.option, value === o.key && { backgroundColor: theme.background }]}
              >
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: value === o.key ? "700" : "500" }}>{o.label}</Text>
                {value === o.key && <Ionicons name="checkmark" size={18} color={theme.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}
const inputStyle = (theme: any) => ({ borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: theme.text, borderColor: theme.border, backgroundColor: theme.surface, minHeight: 52 });
const styles = StyleSheet.create({
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 20 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  memberRow: { flexDirection: "row", gap: 16, paddingRight: 8 },
  memberItem: { alignItems: "center" },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  avatarCheck: { position: "absolute", right: -2, bottom: -2, width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 2 },
});
const ddStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  sheet: { width: 220, borderRadius: 16, borderWidth: 1, padding: 8 },
  option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10 },
});
