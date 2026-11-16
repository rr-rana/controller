import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { telemetryStore } from '@/lib/connection';
import { useStore } from '@/lib/store';
import { C } from '@/lib/theme';

const MAX = 180;
const START = 135; // degrees, SVG coords (0 = +x, clockwise)
const SWEEP = 270;

const angleFor = (kmh: number) => START + (Math.min(Math.max(kmh, 0), MAX) / MAX) * SWEEP;
const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: 100 + r * Math.cos(a), y: 100 + r * Math.sin(a) };
};
const arc = (r: number, from: number, to: number) => {
  const p0 = polar(r, from);
  const p1 = polar(r, to);
  return `M${p0.x} ${p0.y} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${p1.x} ${p1.y}`;
};

/** Static dial face (ticks + numbers), memoised so telemetry updates don't redraw it. */
const Dial = memo(function Dial({ size }: { size: number }) {
  const ticks = [];
  for (let v = 0; v <= MAX; v += 5) {
    const major = v % 20 === 0;
    const mid = v % 10 === 0;
    const a = angleFor(v);
    const p0 = polar(major ? 76 : mid ? 79 : 81, a);
    const p1 = polar(86, a);
    ticks.push(
      <Line key={v} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={major ? '#e6e6e6' : '#8a8f97'} strokeWidth={major ? 2 : 1} />,
    );
    if (major) {
      const t = polar(64, a);
      ticks.push(
        <SvgText key={`t${v}`} x={t.x} y={t.y + 4} fill="#e8e8e8" fontSize="11" fontWeight="600" textAnchor="middle">
          {v}
        </SvgText>,
      );
    }
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        <RadialGradient id="face" cx="50%" cy="45%" r="60%">
          <Stop offset="0" stopColor="#1d2026" />
          <Stop offset="1" stopColor="#0c0e11" />
        </RadialGradient>
        <RadialGradient id="hubg" cx="50%" cy="40%" r="60%">
          <Stop offset="0" stopColor="#1a1c21" />
          <Stop offset="1" stopColor="#08090b" />
        </RadialGradient>
      </Defs>
      <Circle cx="100" cy="100" r="97" fill="#050607" stroke="#3b3f46" strokeWidth={2.5} />
      <Circle cx="100" cy="100" r="93" fill="url(#face)" />
      <Path d={arc(88, START, START + SWEEP)} stroke="#262a31" strokeWidth={3} fill="none" />
      <G>{ticks}</G>
      <Circle cx="100" cy="100" r="37" fill="url(#hubg)" stroke="#2c3036" strokeWidth={1.5} />
    </Svg>
  );
});

export function Speedometer({ size }: { size: number }) {
  const data = useStore(telemetryStore, (t) => t.data);
  const speed = data ? data.speedKmh : null;
  const angle = useSharedValue(START);

  useEffect(() => {
    // short smoothing between 20 Hz telemetry samples; not a decorative animation
    angle.set(withTiming(angleFor(speed ?? 0), { duration: 90, easing: Easing.linear }));
  }, [speed, angle]);

  const needleStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.get() - START}deg` }] }));
  const progress = speed !== null && speed > 0.5 ? arc(88, START, angleFor(speed)) : null;
  const font = size * 0.2;

  return (
    <View style={{ width: size, height: size }}>
      <Dial size={size} />
      {progress && (
        <Svg width={size} height={size} viewBox="0 0 200 200" style={StyleSheet.absoluteFill}>
          <Path d={progress} stroke={C.gold} strokeWidth={4} fill="none" strokeLinecap="round" />
        </Svg>
      )}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, needleStyle]}>
        <Svg width={size} height={size} viewBox="0 0 200 200">
          {/* needle drawn at START angle, rotated by (angle - START) */}
          <Path
            d={`M${polar(40, START).x} ${polar(40, START).y} L${polar(84, START - 1.2).x} ${polar(84, START - 1.2).y} L${polar(84, START + 1.2).x} ${polar(84, START + 1.2).y} Z`}
            fill={speed === null ? C.faint : C.gold}
          />
        </Svg>
      </Animated.View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={[styles.speed, { fontSize: font, color: speed === null ? C.faint : C.text }]}>
          {speed === null ? '--' : Math.round(speed)}
        </Text>
        <Text style={[styles.unit, { fontSize: Math.max(9, size * 0.065) }]}>{speed === null ? 'NO DATA' : 'km/h'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  speed: { fontWeight: '700', fontVariant: ['tabular-nums'], includeFontPadding: false },
  unit: { color: C.dim, marginTop: -2 },
});
