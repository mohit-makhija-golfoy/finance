import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useRouter, Link } from "expo-router";
import { useAuth } from "@/src/contexts/AuthContext";
import { useTheme } from "@/src/contexts/ThemeContext";
import Screen from "@/src/components/Screen";

export default function Register() {
  const { theme } = useTheme();
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await register(email.trim(), password, name.trim() || undefined);
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

          <Text style={[styles.label, { color: theme.textMuted, marginTop: 20 }]}>PASSWORD</Text>
          <TextInput
            testID="password-input"
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
            secureTextEntry
            placeholder="Min 6 characters"
            placeholderTextColor={theme.textMuted}
            value={password}
            onChangeText={setPassword}
          />

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
});
