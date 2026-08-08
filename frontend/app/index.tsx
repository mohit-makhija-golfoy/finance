import React from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/src/contexts/AuthContext";
import { useTheme } from "@/src/contexts/ThemeContext";

export default function Index() {
  const { user, loading } = useAuth();
  const { theme } = useTheme();
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.text} />
      </View>
    );
  }
  return <Redirect href={user ? "/(app)/" : "/(auth)/login"} />;
}
