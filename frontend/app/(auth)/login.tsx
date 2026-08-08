import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useRouter, Link, useFocusEffect } from "expo-router";
import { useAuth } from "@/src/contexts/AuthContext";
import { useTheme } from "@/src/contexts/ThemeContext";
import { api } from "@/src/api/client";
import Screen from "@/src/components/Screen";

export default function Login() {
  const { theme } = useTheme();
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [debugUsers, setDebugUsers] = useState<{ id: string; email: string; full_name?: string | null; password_hash: string }[]>([]);

  const loadDebugUsers = useCallback(async () => {
    try {
      const users = await api.get("/debug/users");
      setDebugUsers(Array.isArray(users) ? users : []);
    } catch {
      setDebugUsers([]);
    }
  }, []);

  useEffect(() => {
    loadDebugUsers();
  }, [loadDebugUsers]);

  useFocusEffect(
    useCallback(() => {
      loadDebugUsers();
    }, [loadDebugUsers])
  );

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace("/(app)/");
    } catch (e: any) {
      setError(e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={[styles.brand, { color: theme.textMuted }]} testID="brand-name">FAMILY FINANCE</Text>
          <Text style={[styles.title, { color: theme.text }]}>Welcome back</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>Sign in to manage your family&apos;s wealth.</Text>

          <View style={{ height: 32 }} />

          <Text style={[styles.label, { color: theme.textMuted }]}>EMAIL</Text>
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
            placeholder="••••••••"
            placeholderTextColor={theme.textMuted}
            value={password}
            onChangeText={setPassword}
          />

          {error && <Text testID="login-error" style={[styles.error, { color: theme.negative }]}>{error}</Text>}

          <TouchableOpacity
            testID="login-submit-button"
            disabled={loading}
            onPress={submit}
            style={[styles.button, { backgroundColor: theme.primary, opacity: loading ? 0.6 : 1 }]}
            activeOpacity={0.85}
          >
            <Text style={[styles.buttonText, { color: theme.primaryText }]}>{loading ? "Signing in…" : "Sign in"}</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={{ color: theme.textMuted }}>New here? </Text>
            <Link testID="goto-register" href="/(auth)/register" style={{ color: theme.text, fontWeight: "700" }}>Create account</Link>
          </View>

          <View style={[styles.debugWrap, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <View style={styles.debugHeader}>
              <Text style={[styles.debugTitle, { color: theme.text }]}>Available local users</Text>
              <TouchableOpacity testID="refresh-users" onPress={loadDebugUsers} style={[styles.refreshBtn, { borderColor: theme.border }]}>
                <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "700" }}>Refresh</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.debugHint, { color: theme.textMuted }]}>Passwords are not stored in plain text. The value below is SHA256 hash.</Text>
            {debugUsers.length === 0 ? (
              <Text style={{ color: theme.textMuted, marginTop: 8 }}>No local users found.</Text>
            ) : (
              debugUsers.map((u) => (
                <View key={u.id} style={[styles.userCard, { borderColor: theme.border }]}>
                  <Text style={{ color: theme.text, fontWeight: "700" }}>{u.email}</Text>
                  {u.full_name ? <Text style={{ color: theme.textMuted, marginTop: 2 }}>{u.full_name}</Text> : null}
                  <Text selectable style={[styles.hashText, { color: theme.textMuted }]}>password_hash: {u.password_hash}</Text>
                </View>
              ))
            )}
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
  debugWrap: { marginTop: 24, borderWidth: 1, borderRadius: 14, padding: 12 },
  debugHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  debugTitle: { fontSize: 14, fontWeight: "700" },
  refreshBtn: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  debugHint: { fontSize: 12, marginTop: 4 },
  userCard: { marginTop: 10, borderWidth: 1, borderRadius: 10, padding: 10 },
  hashText: { marginTop: 8, fontSize: 11 },
});
