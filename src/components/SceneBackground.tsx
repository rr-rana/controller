import { memo } from 'react';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { C } from '@/lib/theme';

/** Static dusk road scene behind the dashboard (pure vector, no image assets). */
export const SceneBackground = memo(function SceneBackground({ width, height }: { width: number; height: number }) {
  const w = width;
  const h = height;
  const horizon = h * 0.42;
  const cx = w * 0.52;
  return (
    <Svg width={w} height={h} style={{ position: 'absolute', top: 0, left: 0 }}>
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0b0e14" />
          <Stop offset="0.55" stopColor="#1a2333" />
          <Stop offset="0.85" stopColor="#6b4a2c" />
          <Stop offset="1" stopColor="#c27a33" />
        </LinearGradient>
        <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.bg} stopOpacity="0" />
          <Stop offset="0.55" stopColor={C.bg} stopOpacity="0.85" />
          <Stop offset="1" stopColor={C.bg} stopOpacity="1" />
        </LinearGradient>
        <LinearGradient id="road" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1b1e23" />
          <Stop offset="1" stopColor="#0d0f12" />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={horizon} fill="url(#sky)" />
      {/* far mountains */}
      <Path
        d={`M0 ${horizon} L0 ${horizon * 0.82} L${w * 0.08} ${horizon * 0.74} L${w * 0.17} ${horizon * 0.8} L${w * 0.28} ${horizon * 0.66} L${w * 0.38} ${horizon * 0.78} L${w * 0.47} ${horizon * 0.7} L${w * 0.58} ${horizon * 0.8} L${w * 0.68} ${horizon * 0.68} L${w * 0.8} ${horizon * 0.79} L${w * 0.9} ${horizon * 0.72} L${w} ${horizon * 0.8} L${w} ${horizon} Z`}
        fill="#2a3346"
      />
      {/* near hills / treeline */}
      <Path
        d={`M0 ${horizon} L0 ${horizon * 0.86} Q${w * 0.12} ${horizon * 0.8} ${w * 0.24} ${horizon * 0.9} T${w * 0.44} ${horizon * 0.95} L${w * 0.6} ${horizon * 0.95} Q${w * 0.74} ${horizon * 0.84} ${w * 0.86} ${horizon * 0.88} T${w} ${horizon * 0.86} L${w} ${horizon} Z`}
        fill="#11161e"
      />
      {/* ground + road */}
      <Rect x={0} y={horizon} width={w} height={h - horizon} fill="#0e1114" />
      <Path d={`M${cx - 4} ${horizon} L${cx + 4} ${horizon} L${w * 0.98} ${h} L${w * 0.06} ${h} Z`} fill="url(#road)" />
      <Path
        d={`M${cx} ${horizon} L${cx + w * 0.012} ${h}`}
        stroke="#9aa0a8"
        strokeWidth={2}
        strokeDasharray="6 10"
        opacity={0.45}
      />
      <Rect x={0} y={0} width={w} height={h} fill="url(#fade)" />
    </Svg>
  );
});
