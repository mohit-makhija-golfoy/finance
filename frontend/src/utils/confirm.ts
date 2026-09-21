import { Alert, Platform } from "react-native";

// react-native-web's Alert.alert() is a no-op, so a plain Alert.alert with a
// destructive button never fires its onPress on web — the confirmation
// silently does nothing. Route through window.confirm there instead.
export function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    const text = message ? `${title}\n\n${message}` : title;
    if (typeof window !== "undefined" && typeof window.confirm === "function" && window.confirm(text)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}
