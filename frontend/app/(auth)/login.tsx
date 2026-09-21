import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Modal } from "react-native";
import { useRouter, Link, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/contexts/AuthContext";
import { useTheme } from "@/src/contexts/ThemeContext";
import { api } from "@/src/api/client";
import Screen from "@/src/components/Screen";

export default function Login() {
  const { theme } = useTheme();
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [debugUsers, setDebugUsers] = useState<{ id: string; email: string; full_name?: string | null }[]>([]);
  const [showUserPicker, setShowUserPicker] = useState(false);

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
      await login(email.trim());
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

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[styles.label, { color: theme.textMuted }]}>EMAIL</Text>
            {debugUsers.length > 0 && (
              <TouchableOpacity testID="choose-user-button" onPress={() => setShowUserPicker(true)}>
                <Text style={{ color: theme.text, fontSize: 11, fontWeight: "700" }}>Choose user ▾</Text>
              </TouchableOpacity>
            )}
          </View>
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
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal transparent visible={showUserPicker} animationType="fade" onRequestClose={() => setShowUserPicker(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setShowUserPicker(false)} style={styles.pickerBackdrop}>
          <View style={[styles.pickerSheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.debugTitle, { color: theme.text, marginBottom: 8 }]}>Select a user</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {debugUsers.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  testID={`choose-user-${u.id}`}
                  onPress={() => { setEmail(u.email); setShowUserPicker(false); }}
                  style={[styles.pickerOption, email === u.email && { backgroundColor: theme.background }]}
                >
                  <View>
                    <Text style={{ color: theme.text, fontWeight: "700" }}>{u.email}</Text>
                    {u.full_name ? <Text style={{ color: theme.textMuted, marginTop: 2, fontSize: 12 }}>{u.full_name}</Text> : null}
                  </View>
                  {email === u.email && <Ionicons name="checkmark" size={18} color={theme.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
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
  debugTitle: { fontSize: 14, fontWeight: "700" },
  pickerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  pickerSheet: { width: "85%", maxWidth: 360, borderRadius: 16, borderWidth: 1, padding: 16 },
  pickerOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10 },
});
