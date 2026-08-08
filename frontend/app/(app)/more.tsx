import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, Platform, Modal, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/src/contexts/ThemeContext";
import { useAuth } from "@/src/contexts/AuthContext";
import { api } from "@/src/api/client";
import Screen from "@/src/components/Screen";
import Checkbox from "@/src/components/Checkbox";
import { validatePassword } from "@/src/utils/auth";
import type { BackupSection } from "@/src/database/db";

const BACKUP_OPTIONS: { key: BackupSection; label: string; description: string }[] = [
  { key: "users", label: "Users", description: "Accounts and login identities" },
  { key: "members", label: "Members", description: "Family member profiles" },
  { key: "categories", label: "Categories", description: "Income and expense categories" },
  { key: "tags", label: "Tags", description: "Custom labels for transactions" },
  { key: "category_rules", label: "Auto-categorize rules", description: "Keyword → category/tag rules" },
  { key: "transactions", label: "Transactions", description: "Income and expense entries" },
  { key: "investments", label: "Investments", description: "Investments, value history, and withdrawals" },
  { key: "loans", label: "Loans", description: "Loans and payment history" },
  { key: "settings", label: "Settings", description: "Theme mode and active session" },
];

type BackupAction = "export" | "import" | null;
type SectionSelection = Record<BackupSection, boolean>;
type ImportMode = "add" | "replace";

function createDefaultSelection(): SectionSelection {
  return BACKUP_OPTIONS.reduce((acc, option) => {
    acc[option.key] = true;
    return acc;
  }, {} as SectionSelection);
}

export default function More() {
  const { theme, mode, toggle, setModeValue } = useTheme();
  const { user, logout, refreshSession } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<any[]>([]);
  const [backupAction, setBackupAction] = useState<BackupAction>(null);
  const [sectionSelection, setSectionSelection] = useState<SectionSelection>(createDefaultSelection());
  const [busy, setBusy] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("add");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");

  const load = useCallback(async () => {
    try {
      const m = await api.get("/members");
      setMembers(m);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const allSelected = useMemo(() => BACKUP_OPTIONS.every((option) => sectionSelection[option.key]), [sectionSelection]);
  const selectedSections = useMemo(() => BACKUP_OPTIONS.filter((option) => sectionSelection[option.key]).map((option) => option.key), [sectionSelection]);

  const openBackupModal = (action: Exclude<BackupAction, null>) => {
    setSectionSelection(createDefaultSelection());
    setImportMode("add");
    setBackupAction(action);
  };

  const toggleSection = (key: BackupSection) => {
    setSectionSelection((current) => ({ ...current, [key]: !current[key] }));
  };

  const setAllSections = (value: boolean) => {
    setSectionSelection(BACKUP_OPTIONS.reduce((acc, option) => {
      acc[option.key] = value;
      return acc;
    }, {} as SectionSelection));
  };

  const closeBackupModal = () => {
    if (busy) return;
    setBackupAction(null);
  };

  const exportBackup = async () => {
    if (!selectedSections.length) {
      Alert.alert("Select data", "Choose at least one section to export.");
      return;
    }
    if (Platform.OS !== "web") {
      Alert.alert("Web only", "Backup download/upload is currently available on web in this build.");
      return;
    }

    setBusy(true);
    try {
      const backup = await api.exportBackup(selectedSections);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `family-finance-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setBackupAction(null);
    } catch (error: any) {
      Alert.alert("Export failed", error?.message || "Failed to export backup.");
    } finally {
      setBusy(false);
    }
  };

  const importBackup = async () => {
    if (!selectedSections.length) {
      Alert.alert("Select data", "Choose at least one section to import.");
      return;
    }
    if (Platform.OS !== "web") {
      Alert.alert("Web only", "Backup download/upload is currently available on web in this build.");
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        setBusy(true);
        try {
          const parsed = JSON.parse(String(reader.result || "{}"));
          if (importMode === "replace") {
            const existingBackup = await api.exportBackup(selectedSections);
            const replaceBlob = new Blob([JSON.stringify(existingBackup, null, 2)], { type: "application/json" });
            const replaceUrl = URL.createObjectURL(replaceBlob);
            const replaceLink = document.createElement("a");
            replaceLink.href = replaceUrl;
            replaceLink.download = `family-finance-pre-import-backup-${new Date().toISOString().slice(0, 10)}.json`;
            replaceLink.click();
            URL.revokeObjectURL(replaceUrl);
          }

          await api.importBackup(parsed, selectedSections, importMode);
          if (selectedSections.includes("settings") && (parsed?.settings?.theme_mode === "light" || parsed?.settings?.theme_mode === "dark")) {
            setModeValue(parsed.settings.theme_mode);
          }
          if (selectedSections.includes("users")) {
            await refreshSession();
          }
          await load();
          setBackupAction(null);
          Alert.alert("Import complete", importMode === "replace" ? "Selected sections were backed up and then replaced successfully." : "Selected sections were added successfully.");
        } catch (error: any) {
          Alert.alert("Import failed", error?.message || "The backup file could not be imported.");
        } finally {
          setBusy(false);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const submitPasswordChange = async () => {
    const trimmed = newPassword.trim();
    const validation = validatePassword(trimmed);
    if (!validation.valid) {
      Alert.alert("Invalid password", validation.error || "Password is invalid.");
      return;
    }
    if (trimmed !== confirmPassword.trim()) {
      Alert.alert("Mismatch", "Password confirmation does not match.");
      return;
    }

    setBusy(true);
    try {
      await api.changePassword(trimmed);
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordModal(false);
      Alert.alert("Password changed", "Your local password has been updated.");
    } catch (error: any) {
      Alert.alert("Update failed", error?.message || "Could not change password.");
    } finally {
      setBusy(false);
    }
  };

  const startDeleteAccount = () => {
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      const ok = window.confirm("Are you sure you wanna delete your account? This will permanently remove all your data.");
      if (ok) setShowDeleteAccountModal(true);
      return;
    }

    Alert.alert(
      "Delete account?",
      "Are you sure you wanna delete your account? This will permanently remove all your data.",
      [
        { text: "Cancel" },
        {
          text: "Yes, continue",
          style: "destructive",
          onPress: () => setShowDeleteAccountModal(true),
        },
      ]
    );
  };

  const submitDeleteAccount = async () => {
    const password = deletePassword.trim();
    if (!password) {
      Alert.alert("Password required", "Enter your password to delete account.");
      return;
    }

    setBusy(true);
    try {
      await api.deleteAccount(password);
      setDeletePassword("");
      setShowDeleteAccountModal(false);
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert("Account deleted successfully.");
      }
      await logout();
      router.replace("/(auth)/login");
    } catch (error: any) {
      const message = error?.message || "Could not delete account.";
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(`Delete failed: ${message}`);
      } else {
        Alert.alert("Delete failed", message);
      }
    } finally {
      setBusy(false);
    }
  };

  const onDeleteMember = (id: string) => {
    Alert.alert("Delete member?", "All linked records remain but unassigned.", [
      { text: "Cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await api.del(`/members/${id}`); load(); } },
    ]);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
        <Text style={[styles.title, { color: theme.text }]}>More</Text>

        <Text style={[styles.section, { color: theme.textMuted }]}>ACCOUNT</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>{user?.full_name || user?.email}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4 }}>{user?.email}</Text>
        </View>

        <View style={styles.headerRow}>
          <Text style={[styles.section, { color: theme.textMuted }]}>MEMBERS</Text>
          <TouchableOpacity testID="add-member-btn" onPress={() => router.push("/member-form")}>
            <Text style={{ color: theme.text, fontWeight: "700" }}>+ Add</Text>
          </TouchableOpacity>
        </View>
        {members.map((m) => (
          <TouchableOpacity
            key={m.id}
            testID={`member-row-${m.id}`}
            onLongPress={() => onDeleteMember(m.id)}
            onPress={() => router.push({ pathname: "/member-form", params: { id: m.id } })}
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, flexDirection: "row", alignItems: "center" }]}
          >
            <View style={[styles.dot, { backgroundColor: m.color || theme.primary }]} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>{m.name}</Text>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>{m.relation || "—"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        ))}

        <Text style={[styles.section, { color: theme.textMuted }]}>BACKUP & RESTORE</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <TouchableOpacity testID="export-backup" onPress={() => openBackupModal("export")} style={styles.exportRow}>
            <Ionicons name="download-outline" size={18} color={theme.text} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: "600" }}>Export app backup</Text>
              <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>One file with selected users, members, categories, transactions, investments, loans, and settings.</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity testID="import-backup" onPress={() => openBackupModal("import")} style={styles.exportRow}>
            <Ionicons name="cloud-upload-outline" size={18} color={theme.text} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: "600" }}>Import app backup</Text>
              <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>Restore only the sections you tick from a previously exported backup file.</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={[styles.section, { color: theme.textMuted }]}>SETTINGS</Text>
        <TouchableOpacity testID="open-categories" onPress={() => router.push("/categories")} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Ionicons name="pricetags-outline" size={18} color={theme.text} />
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>Categories</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity testID="open-tags" onPress={() => router.push("/tags")} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Ionicons name="pricetag-outline" size={18} color={theme.text} />
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>Manage tags</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity testID="open-category-rules" onPress={() => router.push("/category-rules")} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Ionicons name="git-branch-outline" size={18} color={theme.text} />
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>Auto-categorize rules</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity testID="open-reports" onPress={() => router.push("/reports")} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Ionicons name="bar-chart-outline" size={18} color={theme.text} />
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>Reports & Charts</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity testID="change-password" onPress={() => setShowPasswordModal(true)} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}> 
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Ionicons name="key-outline" size={18} color={theme.text} />
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>Change password</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity testID="delete-account" onPress={startDeleteAccount} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.negative + "44", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}> 
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Ionicons name="trash-outline" size={18} color={theme.negative} />
            <Text style={{ color: theme.negative, fontSize: 16, fontWeight: "600" }}>Delete account</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </TouchableOpacity>

        <Text style={[styles.section, { color: theme.textMuted }]}>PREFERENCES</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>Dark mode</Text>
          <Switch testID="dark-mode-switch" value={mode === "dark"} onValueChange={toggle} />
        </View>

        <TouchableOpacity
          testID="logout-button"
          onPress={async () => { await logout(); router.replace("/(auth)/login"); }}
          style={[styles.logout, { borderColor: theme.border }]}
        >
          <Ionicons name="log-out-outline" size={20} color={theme.negative} />
          <Text style={{ color: theme.negative, fontWeight: "700", fontSize: 16 }}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal transparent visible={backupAction !== null} animationType="slide" onRequestClose={closeBackupModal}>
        <TouchableOpacity activeOpacity={1} onPress={closeBackupModal} style={styles.backdrop}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>{backupAction === "export" ? "Export backup" : "Import backup"}</Text>
            <Text style={{ color: theme.textMuted, marginTop: 6, fontSize: 13 }}>
              Tick the sections you want to {backupAction === "export" ? "include in the backup file" : "restore from the backup file"}.
            </Text>

            {backupAction === "import" && (
              <View style={{ marginTop: 16, gap: 8 }}>
                <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700" }}>IMPORT MODE</Text>
                <TouchableOpacity testID="import-mode-add" onPress={() => setImportMode("add")} style={[styles.modeCard, { borderColor: importMode === "add" ? theme.primary : theme.border, backgroundColor: importMode === "add" ? theme.primary + "22" : "transparent" }]}> 
                  <Text style={{ color: theme.text, fontWeight: "700" }}>Add</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>Keep existing selected data and add the imported selected entries as well.</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="import-mode-replace" onPress={() => setImportMode("replace")} style={[styles.modeCard, { borderColor: importMode === "replace" ? theme.primary : theme.border, backgroundColor: importMode === "replace" ? theme.primary + "22" : "transparent" }]}> 
                  <Text style={{ color: theme.text, fontWeight: "700" }}>Replace</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>First download a backup of the current selected data, then replace it with the imported selected data.</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ marginTop: 16 }}>
              <Checkbox value={allSelected} onChange={setAllSections} label="Select all" testID="backup-select-all" />
            </View>

            <ScrollView style={{ maxHeight: 320, marginTop: 8 }}>
              {BACKUP_OPTIONS.map((option) => (
                <View key={option.key} style={[styles.optionCard, { borderColor: theme.border }]}> 
                  <Checkbox value={sectionSelection[option.key]} onChange={() => toggleSection(option.key)} label={option.label} testID={`backup-section-${option.key}`} />
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginLeft: 32, marginTop: 2 }}>{option.description}</Text>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              testID={backupAction === "export" ? "run-export-backup" : "run-import-backup"}
              onPress={() => { void (backupAction === "export" ? exportBackup() : importBackup()); }}
              disabled={busy}
              style={[styles.primaryBtn, { backgroundColor: theme.primary, opacity: busy ? 0.6 : 1 }]}
            >
              <Text style={{ color: theme.primaryText, fontWeight: "700" }}>{busy ? "Working..." : backupAction === "export" ? "Download backup" : "Choose file to import"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={closeBackupModal} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
              <Text style={{ color: theme.text, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal transparent visible={showPasswordModal} animationType="slide" onRequestClose={() => setShowPasswordModal(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => !busy && setShowPasswordModal(false)} style={styles.backdrop}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>Change password</Text>
            <Text style={{ color: theme.textMuted, marginTop: 6, fontSize: 13 }}>Set a new local password for this account. Old password is not required.</Text>

            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>NEW PASSWORD</Text>
            <TextInput secureTextEntry value={newPassword} onChangeText={setNewPassword} placeholder="Minimum 6 characters" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]} />

            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>CONFIRM PASSWORD</Text>
            <TextInput secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter password" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]} />

            <TouchableOpacity testID="submit-password-change" onPress={() => { void submitPasswordChange(); }} disabled={busy} style={[styles.primaryBtn, { backgroundColor: theme.primary, opacity: busy ? 0.6 : 1 }]}> 
              <Text style={{ color: theme.primaryText, fontWeight: "700" }}>{busy ? "Saving..." : "Update password"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowPasswordModal(false)} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
              <Text style={{ color: theme.text, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal transparent visible={showDeleteAccountModal} animationType="slide" onRequestClose={() => setShowDeleteAccountModal(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => !busy && setShowDeleteAccountModal(false)} style={styles.backdrop}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
            <Text style={{ color: theme.negative, fontSize: 20, fontWeight: "700" }}>Delete account</Text>
            <Text style={{ color: theme.textMuted, marginTop: 6, fontSize: 13 }}>
              Enter your password to permanently delete this account and all related data.
            </Text>

            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>PASSWORD</Text>
            <TextInput
              secureTextEntry
              value={deletePassword}
              onChangeText={setDeletePassword}
              placeholder="Enter password"
              placeholderTextColor={theme.textMuted}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
            />

            <TouchableOpacity testID="confirm-delete-account" onPress={() => { void submitDeleteAccount(); }} disabled={busy} style={[styles.primaryBtn, { backgroundColor: theme.negative, opacity: busy ? 0.6 : 1 }]}> 
              <Text style={{ color: "#fff", fontWeight: "700" }}>{busy ? "Deleting..." : "Delete account permanently"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowDeleteAccountModal(false)} style={[styles.secondaryBtn, { borderColor: theme.border }]}> 
              <Text style={{ color: theme.text, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5, marginBottom: 16 },
  section: { fontSize: 11, letterSpacing: 2, fontWeight: "700", marginTop: 24, marginBottom: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  card: { padding: 16, borderRadius: 20, borderWidth: 1, marginBottom: 10, gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  exportRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 6 },
  logout: { marginTop: 32, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10, padding: 16, borderRadius: 999, borderWidth: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1 },
  modeCard: { borderWidth: 1, borderRadius: 14, padding: 12 },
  optionCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8 },
  primaryBtn: { marginTop: 18, paddingVertical: 14, borderRadius: 999, alignItems: "center" },
  secondaryBtn: { marginTop: 10, paddingVertical: 14, borderRadius: 999, borderWidth: 1, alignItems: "center" },
  fieldLabel: { fontSize: 11, letterSpacing: 2, fontWeight: "700", marginTop: 18, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, minHeight: 52 },
});
