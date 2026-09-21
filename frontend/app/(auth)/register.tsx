import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Modal } from "react-native";
import { useRouter, Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/contexts/AuthContext";
import { useTheme } from "@/src/contexts/ThemeContext";
import { useCurrency } from "@/src/contexts/CurrencyContext";
import { CURRENCY_LIST, DEFAULT_CURRENCY_CODE, type CurrencyCode } from "@/src/constants/currency";
import Screen from "@/src/components/Screen";

export default function Register() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const { setCurrencyCode } = useCurrency();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currencyCode, setSelectedCurrencyCode] = useState<CurrencyCode>(DEFAULT_CURRENCY_CODE);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const selectedCurrency = CURRENCY_LIST.find((c) => c.code === currencyCode) || CURRENCY_LIST[0];

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await register(email.trim(), name.trim() || undefined);
      setCurrencyCode(currencyCode);
      router.replace("/(app)/");
    } catch (e: any) {
      setError(e.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={[styles.brand, { color: theme.textMuted }]}>FAMILY FINANCE</Text>
          <Text style={[styles.title, { color: theme.text }]}>Create your account</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>Track wealth across every member.</Text>

          <View style={{ height: 32 }} />

          <Text style={[styles.label, { color: theme.textMuted }]}>FULL NAME</Text>
          <TextInput
            testID="name-input"
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
            placeholder="Your name"
            placeholderTextColor={theme.textMuted}
            value={name}
            onChangeText={setName}
          />

          <Text style={[styles.label, { color: theme.textMuted, marginTop: 20 }]}>EMAIL</Text>
          <TextInput
            testID="email-input"
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={theme.textMuted}
            value={email}
            onChangeText={setEmail}
          />

          <Text style={[styles.label, { color: theme.textMuted, marginTop: 20 }]}>CURRENCY</Text>
          <TouchableOpacity
            testID="open-currency-picker"
            onPress={() => setShowCurrencyModal(true)}
            activeOpacity={0.7}
            style={[styles.input, { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderColor: theme.border, backgroundColor: theme.surface }]}
          >
            <Text style={{ color: theme.text, fontSize: 16 }}>{selectedCurrency.country} — {selectedCurrency.name} ({selectedCurrency.symbol})</Text>
            <Ionicons name="chevron-down" size={18} color={theme.textMuted} />
          </TouchableOpacity>

          {error && <Text testID="register-error" style={[styles.error, { color: theme.negative }]}>{error}</Text>}

          <TouchableOpacity
            testID="register-submit-button"
            disabled={loading}
            onPress={submit}
            style={[styles.button, { backgroundColor: theme.primary, opacity: loading ? 0.6 : 1 }]}
            activeOpacity={0.85}
          >
            <Text style={[styles.buttonText, { color: theme.primaryText }]}>{loading ? "Creating…" : "Create account"}</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={{ color: theme.textMuted }}>Already have an account? </Text>
            <Link testID="goto-login" href="/(auth)/login" style={{ color: theme.text, fontWeight: "700" }}>Sign in</Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal transparent visible={showCurrencyModal} animationType="slide" onRequestClose={() => setShowCurrencyModal(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setShowCurrencyModal(false)} style={styles.backdrop}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: 20 + insets.bottom }]}>
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>Currency</Text>
            <Text style={{ color: theme.textMuted, marginTop: 6, fontSize: 13 }}>Choose your country/currency. You can change this later in Settings.</Text>

            <ScrollView style={{ maxHeight: 360, marginTop: 16 }}>
              {CURRENCY_LIST.map((c) => (
                <TouchableOpacity
                  key={c.code}
                  testID={`currency-option-${c.code}`}
                  onPress={() => { setSelectedCurrencyCode(c.code); setShowCurrencyModal(false); }}
                  style={[styles.optionCard, { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderColor: c.code === currencyCode ? theme.primary : theme.border, backgroundColor: c.code === currencyCode ? theme.primary + "22" : "transparent" }]}
                >
                  <View>
                    <Text style={{ color: theme.text, fontWeight: "700" }}>{c.country}</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>{c.name} ({c.symbol})</Text>
                  </View>
                  {c.code === currencyCode && <Ionicons name="checkmark-circle" size={20} color={theme.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity onPress={() => setShowCurrencyModal(false)} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
              <Text style={{ color: theme.text, fontWeight: "600" }}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 60 },
  brand: { fontSize: 12, letterSpacing: 3, fontWeight: "600" },
  title: { fontSize: 36, fontWeight: "700", marginTop: 16, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, marginTop: 8 },
  label: { fontSize: 11, letterSpacing: 2, fontWeight: "600", marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, minHeight: 52 },
  button: { marginTop: 32, paddingVertical: 16, borderRadius: 999, alignItems: "center" },
  buttonText: { fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
  error: { marginTop: 12, fontSize: 14 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 24 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1 },
  optionCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8 },
  secondaryBtn: { marginTop: 10, paddingVertical: 14, borderRadius: 999, borderWidth: 1, alignItems: "center" },
});
