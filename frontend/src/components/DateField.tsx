import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "@/src/contexts/ThemeContext";

type Props = {
  value: string; // YYYY-MM-DD
  onChange: (v: string) => void;
  placeholder?: string;
  testID?: string;
};

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DateField({ value, onChange, placeholder = "Pick date", testID }: Props) {
  const { theme } = useTheme();
  const [show, setShow] = useState(false);

  if (Platform.OS === "web") {
    // Use HTML date input for web
    return (
      <View testID={testID} style={[styles.input, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        {React.createElement("input", {
          type: "date",
          value: value || "",
          onChange: (e: any) => onChange(e.target.value),
          style: {
            border: "none",
            outline: "none",
            background: "transparent",
            color: theme.text,
            fontSize: 16,
            width: "100%",
            colorScheme: theme.background === "#09090B" ? "dark" : "light",
          },
        })}
      </View>
    );
  }

  const parsed = value ? new Date(value) : new Date();

  return (
    <>
      <TouchableOpacity
        testID={testID}
        onPress={() => setShow(true)}
        style={[styles.input, { borderColor: theme.border, backgroundColor: theme.surface }]}
        activeOpacity={0.7}
      >
        <Text style={{ color: value ? theme.text : theme.textMuted, fontSize: 16 }}>{value || placeholder}</Text>
      </TouchableOpacity>
      {show && (
        Platform.OS === "ios" ? (
          <Modal transparent animationType="slide" visible={show} onRequestClose={() => setShow(false)}>
            <TouchableOpacity activeOpacity={1} onPress={() => setShow(false)} style={styles.backdrop}>
              <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <DateTimePicker
                  value={parsed}
                  mode="date"
                  display="inline"
                  themeVariant={theme.background === "#09090B" ? "dark" : "light"}
                  onChange={(_, d) => { if (d) onChange(toIso(d)); }}
                />
                <TouchableOpacity testID="date-done" onPress={() => setShow(false)} style={[styles.doneBtn, { backgroundColor: theme.primary }]}>
                  <Text style={{ color: theme.primaryText, fontWeight: "700" }}>Done</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
        ) : (
          <DateTimePicker
            value={parsed}
            mode="date"
            display="default"
            onChange={(_, d) => { setShow(false); if (d) onChange(toIso(d)); }}
          />
        )
      )}
    </>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, minHeight: 52, justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, borderWidth: 1 },
  doneBtn: { paddingVertical: 14, borderRadius: 999, alignItems: "center", marginTop: 12 },
});
