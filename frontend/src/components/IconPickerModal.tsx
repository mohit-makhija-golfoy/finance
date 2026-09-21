import React from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/contexts/ThemeContext";
import { CATEGORY_ICON_OPTIONS, type IoniconName } from "@/src/constants/categoryIconOptions";

type Props = {
  visible: boolean;
  selected?: IoniconName | null;
  onSelect: (icon: IoniconName) => void;
  onClose: () => void;
  title?: string;
};

export default function IconPickerModal({ visible, selected, onSelect, onClose, title = "Choose an icon" }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.backdrop}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: 20 + insets.bottom }]}>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>{title}</Text>
          <ScrollView style={{ maxHeight: 420, marginTop: 16 }} contentContainerStyle={styles.grid}>
            {CATEGORY_ICON_OPTIONS.map((icon) => {
              const isSelected = icon === selected;
              return (
                <TouchableOpacity
                  key={icon}
                  testID={`icon-option-${icon}`}
                  onPress={() => { onSelect(icon); onClose(); }}
                  style={[styles.cell, { backgroundColor: isSelected ? theme.primary : theme.background, borderColor: isSelected ? theme.primary : theme.border }]}
                >
                  <Ionicons name={icon} size={20} color={isSelected ? theme.primaryText : theme.text} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { borderColor: theme.border }]}>
            <Text style={{ color: theme.text, fontWeight: "600" }}>Close</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingBottom: 4 },
  cell: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  closeBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 999, borderWidth: 1, alignItems: "center" },
});
