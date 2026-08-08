import React from "react";
import { View } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop, Circle, Line } from "react-native-svg";
import { useTheme } from "@/src/contexts/ThemeContext";

type Props = {
  data: { x: string; y: number }[];
  height?: number;
  width?: number;
  showAxis?: boolean;
};

export default function MiniLineChart({ data, height = 140, width = 320, showAxis = false }: Props) {
  const { theme } = useTheme();
  if (!data || data.length === 0) return <View style={{ height }} />;
  const pad = 12;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const ys = data.map((d) => d.y);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const range = maxY - minY || 1;
  const stepX = data.length > 1 ? w / (data.length - 1) : w;

  const points = data.map((d, i) => {
    const x = pad + i * stepX;
    const y = pad + h - ((d.y - minY) / range) * h;
    return { x, y };
  });

  // smooth path (cubic-ish)
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const cx = (p0.x + p1.x) / 2;
    path += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  const last = points[points.length - 1];
  const areaPath = `${path} L ${last.x} ${pad + h} L ${points[0].x} ${pad + h} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={theme.chart} stopOpacity="0.25" />
          <Stop offset="1" stopColor={theme.chart} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      {showAxis && (
        <Line x1={pad} y1={pad + h} x2={pad + w} y2={pad + h} stroke={theme.border} strokeWidth={1} />
      )}
      <Path d={areaPath} fill="url(#grad)" />
      <Path d={path} fill="none" stroke={theme.chart} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={2.5} fill={theme.chart} />
      ))}
    </Svg>
  );
}
