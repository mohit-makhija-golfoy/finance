import React, { useMemo } from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, ThemeContext } from "@/src/contexts/ThemeContext";
import { palette, type ThemeMode } from "@/src/constants/theme";

export default function FilterModal({
  visible,
  onClose,
  children,
  topOffset = 70,
  doneTestID,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  topOffset?: number;
  doneTestID?: string;
}) {
  const { mode } = useTheme();
  const insets = useSafeAreaInsets();

  // Filters render as an overlay above the rest of the screen, so give them
  // the opposite theme — it reads as a distinct surface and stays legible
  // regardless of which mode the app itself is in.
  const inverseMode: ThemeMode = mode === "dark" ? "light" : "dark";
  const inverseTheme = palette[inverseMode];
  const contextValue = useMemo(
    () => ({ mode: inverseMode, theme: inverseTheme, toggle: () => {}, setModeValue: () => {} }),
    [inverseMode, inverseTheme]
  );

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.backdrop}>
        <View style={{ flex: 1, paddingTop: insets.top + topOffset, paddingHorizontal: 24, paddingBottom: insets.bottom + 16 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.card, { backgroundColor: inverseTheme.surface, borderColor: inverseTheme.border }]}>
            <ThemeContext.Provider value={contextValue}>
              <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
                {children}
              </ScrollView>
            </ThemeContext.Provider>
            <TouchableOpacity testID={doneTestID} onPress={onClose} style={[styles.doneBtn, { backgroundColor: inverseTheme.primary }]}>
              <Text style={{ color: inverseTheme.primaryText, fontWeight: "700" }}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  card: { flexShrink: 1, padding: 16, borderRadius: 20, borderWidth: 1 },
  doneBtn: { marginTop: 18, paddingVertical: 14, borderRadius: 999, alignItems: "center" },
});
