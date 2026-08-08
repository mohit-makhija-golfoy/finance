import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, G, Path, Text as SvgText } from "react-native-svg";
import { useTheme } from "@/src/contexts/ThemeContext";
import { inr } from "@/src/constants/theme";

type Slice = { label: string; value: number; color?: string };

const DEFAULT_COLORS = [
  "#10B981", "#F43F5E", "#3B82F6", "#F59E0B", "#A855F7",
  "#06B6D4", "#EC4899", "#84CC16", "#F97316", "#8B5CF6",
];

export default function PieChart({ data, size = 220, centerLabel, centerValue }: { data: Slice[]; size?: number; centerLabel?: string; centerValue?: string }) {
  const { theme } = useTheme();
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  if (total <= 0) {
    return (
      <View style={{ alignItems: "center", justifyContent: "center", height: size }}>
        <Text style={{ color: theme.textMuted }}>No data</Text>
      </View>
    );
  }
  const radius = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  const innerR = radius * 0.62;
  let acc = 0;

  const segments = data.map((d, i) => {
    const v = Math.max(0, d.value);
    const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += v;
    const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + radius * Math.cos(start);
    const y1 = cy + radius * Math.sin(start);
    const x2 = cx + radius * Math.cos(end);
    const y2 = cy + radius * Math.sin(end);
    const xi2 = cx + innerR * Math.cos(end);
    const yi2 = cy + innerR * Math.sin(end);
    const xi1 = cx + innerR * Math.cos(start);
    const yi1 = cy + innerR * Math.sin(start);
    const path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${innerR} ${innerR} 0 ${large} 0 ${xi1} ${yi1} Z`;
    return { path, color: d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length] };
  });

  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <G>
            {segments.map((s, i) => (
              <Path key={i} d={s.path} fill={s.color} />
            ))}
          </G>
        </Svg>
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]} pointerEvents="none">
          {centerLabel ? <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "700" }}>{centerLabel}</Text> : null}
          {centerValue ? <Text style={{ color: theme.text, fontSize: 22, fontWeight: "700", marginTop: 4 }}>{centerValue}</Text> : null}
        </View>
      </View>
      <View style={{ marginTop: 16, alignSelf: "stretch" }}>
        {data.map((d, i) => (
          <View key={`${d.label}-${i}`} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length] }]} />
            <Text style={[styles.legendLabel, { color: theme.text }]} numberOfLines={1}>{d.label}</Text>
            <Text style={{ color: theme.textMuted, fontWeight: "600", fontSize: 13 }}>{inr(d.value)}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 11, marginLeft: 6, width: 42, textAlign: "right" }}>{total ? Math.round((d.value / total) * 100) : 0}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legendRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 13, fontWeight: "500" },
});
