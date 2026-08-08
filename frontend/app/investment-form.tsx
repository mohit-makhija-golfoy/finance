import React, { useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/contexts/ThemeContext";
import { api } from "@/src/api/client";
import Screen from "@/src/components/Screen";
import DateField from "@/src/components/DateField";
import { toLocalYMD } from "@/src/utils/date";

export default function InvestmentForm() {
  const { theme } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [name, setName] = useState("");
  const [type, setType] = useState<"onetime" | "recurring" | "dynamic">("onetime");
  const [amount, setAmount] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [startDate, setStartDate] = useState(toLocalYMD(new Date()));
  const [maturityDate, setMaturityDate] = useState("");
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
        setStartDate(inv.start_date); setMaturityDate(inv.maturity_date || "");
        setExpectedReturn(String(inv.expected_return || ""));
        setReturnType(inv.expected_return_type || "percent");
        setMemberId(inv.member_id);
        setCurrentValue(String(inv.current_value || ""));
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
        maturity_date: maturityDate || null,
        expected_return: parseFloat(expectedReturn) || null,
        expected_return_type: returnType,
      };
      if (type === "dynamic") body.current_value = parseFloat(currentValue) || parseFloat(amount) || 0;
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
              {(["onetime", "recurring", "dynamic"] as const).map((t) => (
                <TouchableOpacity key={t} testID={`inv-type-${t}`} onPress={() => setType(t)}
                  style={[styles.chip, { backgroundColor: type === t ? theme.primary : theme.surface, borderColor: type === t ? theme.primary : theme.border }]}>
                  <Text style={{ color: type === t ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12, textTransform: "capitalize" }}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          <Field label={type === "recurring" ? "MONTHLY AMOUNT (\u20B9)" : "AMOUNT INVESTED (\u20B9)"}>
            <TextInput testID="inv-amount" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0" placeholderTextColor={theme.textMuted} style={inputStyle(theme)} />
          </Field>

          {type === "dynamic" && (
            <Field label="CURRENT VALUE (\u20B9)">
              <TextInput testID="inv-current" keyboardType="decimal-pad" value={currentValue} onChangeText={setCurrentValue} placeholder="0" placeholderTextColor={theme.textMuted} style={inputStyle(theme)} />
            </Field>
          )}

          <Field label="MEMBER">
            <View style={styles.chipRow}>
              {members.map((m) => (
                <TouchableOpacity key={m.id} onPress={() => setMemberId(m.id)} testID={`inv-member-${m.id}`}
                  style={[styles.chip, { backgroundColor: memberId === m.id ? theme.primary : theme.surface, borderColor: memberId === m.id ? theme.primary : theme.border }]}>
                  <Text style={{ color: memberId === m.id ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12 }}>{m.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          <Field label="START DATE"><DateField testID="inv-start" value={startDate} onChange={setStartDate} /></Field>
          {type === "onetime" && <Field label="MATURITY DATE (optional)"><DateField value={maturityDate} onChange={setMaturityDate} placeholder="Pick date" /></Field>}

          <Field label="EXPECTED RETURN (optional)">
            <View style={[styles.chipRow, { marginBottom: 8 }]}>
              {(["percent", "amount"] as const).map((rt) => (
                <TouchableOpacity key={rt} testID={`ret-${rt}`} onPress={() => setReturnType(rt)}
                  style={[styles.chip, { backgroundColor: returnType === rt ? theme.primary : theme.surface, borderColor: returnType === rt ? theme.primary : theme.border }]}>
                  <Text style={{ color: returnType === rt ? theme.primaryText : theme.textMuted, fontWeight: "600", fontSize: 12 }}>{rt === "percent" ? "% Rate" : "\u20B9 Amount"}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput keyboardType="decimal-pad" value={expectedReturn} onChangeText={setExpectedReturn}
              placeholder={returnType === "percent" ? "e.g. 12 (percent)" : "e.g. 150000 (₹)"}
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
const inputStyle = (theme: any) => ({ borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: theme.text, borderColor: theme.border, backgroundColor: theme.surface, minHeight: 52 });
const styles = StyleSheet.create({
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 20 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
});
