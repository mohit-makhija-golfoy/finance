import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/contexts/ThemeContext";

type Ctx = {
  showToast: (message: string, duration?: number) => void;
};

const ToastContext = createContext<Ctx | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, duration = 3000) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setMessage(msg);
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    hideTimer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setMessage(null));
    }, duration);
  }, [opacity]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message !== null && <ToastView message={message} opacity={opacity} />}
    </ToastContext.Provider>
  );
}

function ToastView({ message, opacity }: { message: string; opacity: Animated.Value }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity, bottom: insets.bottom + 28 }]}>
      <View style={[styles.pill, { backgroundColor: theme.text }]}>
        <Text style={{ color: theme.background, fontWeight: "600", fontSize: 14 }} numberOfLines={2}>{message}</Text>
      </View>
    </Animated.View>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside provider");
  return ctx;
};

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  pill: { maxWidth: "86%", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
});
