import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Modal, Platform, ActivityIndicator, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useTheme } from "@/src/contexts/ThemeContext";
import DateField from "@/src/components/DateField";
import Checkbox from "@/src/components/Checkbox";
import PdfExtractor from "@/src/pdf/PdfExtractor";
import { PdfPasswordRequiredError, type PdfExtractorHandle } from "@/src/pdf/types";
import { detectBankName } from "@/src/utils/bankDetector";
import { parseStatementPages, filterEntries } from "@/src/utils/statementParser";
import type { StatementEntry } from "@/src/types/statement";
import { toLocalYMD } from "@/src/utils/date";

type Props = {
  visible: boolean;
  onClose: () => void;
  members: { id: string; name: string }[];
  onParsed: (entries: StatementEntry[], meta: { bankName: string; warnings: string[]; memberId: string }) => void;
};

type RangeMode = "all" | "custom";

async function readBase64(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (Platform.OS === "web") {
    if (!asset.base64) throw new Error("Couldn't read the selected file.");
    // expo-document-picker returns a full data URL on web (e.g. "data:application/pdf;base64,...."), not raw base64.
    const commaIndex = asset.base64.indexOf(",");
    return commaIndex >= 0 ? asset.base64.slice(commaIndex + 1) : asset.base64;
  }
  const file = new File(asset.uri);
  return await file.base64();
}

export default function StatementUploadModal({ visible, onClose, members, onParsed }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const extractorRef = useRef<PdfExtractorHandle>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [memberId, setMemberId] = useState("");
  const [bankName, setBankName] = useState("");
  const [rangeMode, setRangeMode] = useState<RangeMode>("all");
  const [dateFrom, setDateFrom] = useState(toLocalYMD(new Date()));
  const [dateTo, setDateTo] = useState(toLocalYMD(new Date()));
  const [includeCredit, setIncludeCredit] = useState(true);
  const [includeDebit, setIncludeDebit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedPages, setCachedPages] = useState<string[] | null>(null);
  const [pendingBase64, setPendingBase64] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setFileName(null);
      setMemberId("");
      setBankName("");
      setRangeMode("all");
      setIncludeCredit(true);
      setIncludeDebit(true);
      setBusy(false);
      setError(null);
      setCachedPages(null);
      setPendingBase64(null);
      setPasswordRequired(false);
      setPasswordInput("");
      setPasswordError(null);
    }
  }, [visible]);

  const runExtraction = async (base64: string, password?: string) => {
    setBusy(true);
    setError(null);
    try {
      if (!extractorRef.current) throw new Error("PDF reader isn't ready yet. Try again in a moment.");
      const { pages } = await extractorRef.current.extract(base64, password);
      const totalText = pages.join("").trim();
      if (totalText.length < 20) {
        setError("No selectable text found in this PDF. Scanned/image-only statements aren't supported.");
        return;
      }
      setPasswordRequired(false);
      setPasswordError(null);
      setCachedPages(pages);
      if (!bankName) {
        const detected = detectBankName(pages[0] || "");
        if (detected.bankName) setBankName(detected.bankName);
      }
    } catch (e) {
      if (e instanceof PdfPasswordRequiredError) {
        setPasswordRequired(true);
        setPasswordError(e.needsRetry ? "Incorrect password. Try again." : null);
        return;
      }
      setError(e instanceof Error ? e.message : "Couldn't read this PDF. It may be corrupted.");
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async () => {
    setError(null);
    setPasswordRequired(false);
    setPasswordInput("");
    setPasswordError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setFileName(asset.name);
    setCachedPages(null);
    setBusy(true);
    try {
      const base64 = await readBase64(asset);
      setPendingBase64(base64);
      await runExtraction(base64);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the selected file.");
      setBusy(false);
    }
  };

  const unlockWithPassword = () => {
    if (!pendingBase64 || !passwordInput) return;
    runExtraction(pendingBase64, passwordInput);
  };

  const submit = () => {
    if (!cachedPages || !memberId) return;
    setError(null);
    const { entries, warnings } = parseStatementPages(cachedPages);
    const filtered = filterEntries(entries, {
      includeCredit,
      includeDebit,
      dateFrom: rangeMode === "custom" ? dateFrom : undefined,
      dateTo: rangeMode === "custom" ? dateTo : undefined,
    });
    if (filtered.length === 0) {
      setError("No transactions matched your filters. Try widening the date range or enabling both credit and debit.");
      return;
    }
    onParsed(filtered, { bankName: bankName.trim(), warnings, memberId });
  };

  const submitDisabled = !cachedPages || !memberId || busy || (!includeCredit && !includeDebit);

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <PdfExtractor ref={extractorRef} />
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={
          Platform.OS === "web"
            ? styles.backdrop
            : [styles.backdrop, { position: "absolute", top: -insets.top, left: 0, right: 0, bottom: 0 }]
        }
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Upload Statement</Text>
          <Text style={{ color: theme.textMuted, marginTop: 6, fontSize: 13 }}>
            Import income/expense entries from a bank statement PDF.
          </Text>

          <TouchableOpacity
            testID="statement-pick-file"
            onPress={pickFile}
            style={[styles.pickBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
          >
            <Text style={{ color: theme.text, fontWeight: "600" }} numberOfLines={1}>
              {fileName || "Choose PDF file"}
            </Text>
          </TouchableOpacity>

          {busy && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
              <ActivityIndicator color={theme.primary} />
              <Text style={{ color: theme.textMuted, fontSize: 13 }}>Reading statement...</Text>
            </View>
          )}

          {passwordRequired && !busy && (
            <View style={{ marginTop: 16 }}>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>This PDF is password-protected</Text>
              <TextInput
                testID="statement-pdf-password"
                value={passwordInput}
                onChangeText={setPasswordInput}
                placeholder="Enter PDF password"
                placeholderTextColor={theme.textMuted}
                secureTextEntry
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background, marginTop: 10 }]}
              />
              {passwordError && <Text style={{ color: theme.negative, marginTop: 8, fontSize: 12 }}>{passwordError}</Text>}
              <TouchableOpacity
                testID="statement-unlock-btn"
                onPress={unlockWithPassword}
                disabled={!passwordInput}
                style={[styles.pickBtn, { marginTop: 10, borderColor: theme.primary, opacity: !passwordInput ? 0.5 : 1, alignItems: "center" }]}
              >
                <Text style={{ color: theme.primary, fontWeight: "700" }}>Unlock</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={[styles.label, { color: theme.textMuted }]}>MEMBER</Text>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: -4, marginBottom: 8 }}>
            Whose statement is this? Imported entries are added to this member.
          </Text>
          <View style={styles.chipRow}>
            {members.map((m) => (
              <TouchableOpacity
                key={m.id}
                testID={`statement-member-${m.id}`}
                onPress={() => setMemberId(m.id)}
                style={[
                  styles.chip,
                  { backgroundColor: memberId === m.id ? theme.primary : theme.background, borderColor: memberId === m.id ? theme.primary : theme.border },
                ]}
              >
                <Text style={{ color: memberId === m.id ? theme.primaryText : theme.text, fontWeight: "600", fontSize: 13 }}>{m.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: theme.textMuted }]}>BANK NAME</Text>
          <TextInput
            testID="statement-bank-name"
            value={bankName}
            onChangeText={setBankName}
            placeholder="e.g. HDFC Bank"
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
          />

          <Text style={[styles.label, { color: theme.textMuted }]}>DATE RANGE</Text>
          <Checkbox testID="statement-range-all" label="All" value={rangeMode === "all"} onChange={() => setRangeMode("all")} />
          <Checkbox testID="statement-range-custom" label="Custom" value={rangeMode === "custom"} onChange={() => setRangeMode("custom")} />
          {rangeMode === "custom" && (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: theme.textMuted, marginTop: 0 }]}>FROM</Text>
                <DateField testID="statement-date-from" value={dateFrom} onChange={setDateFrom} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: theme.textMuted, marginTop: 0 }]}>TO</Text>
                <DateField testID="statement-date-to" value={dateTo} onChange={setDateTo} />
              </View>
            </View>
          )}

          <Text style={[styles.label, { color: theme.textMuted }]}>INCLUDE</Text>
          <Checkbox testID="statement-include-credit" label="Add credit values (income)" value={includeCredit} onChange={setIncludeCredit} />
          <Checkbox testID="statement-include-debit" label="Add debit values (expense)" value={includeDebit} onChange={setIncludeDebit} />

          {error && <Text style={{ color: theme.negative, marginTop: 12, fontSize: 13 }}>{error}</Text>}

          <TouchableOpacity
            testID="statement-submit"
            onPress={submit}
            disabled={submitDisabled}
            style={[styles.submitBtn, { backgroundColor: theme.primary, opacity: submitDisabled ? 0.5 : 1 }]}
          >
            <Text style={{ color: theme.primaryText, fontWeight: "700" }}>Submit</Text>
          </TouchableOpacity>
        </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1, maxHeight: "88%" },
  pickBtn: { marginTop: 16, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
  label: { fontSize: 11, letterSpacing: 2, fontWeight: "700", marginTop: 18, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, minHeight: 52 },
  submitBtn: { marginTop: 20, paddingVertical: 14, borderRadius: 999, alignItems: "center" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
});
