import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import { C, clamp } from '@/lib/theme';

export function Card({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={ui.card}>
      <View style={ui.cardHead}>
        <Text style={ui.cardTitle}>{title}</Text>
        {right}
      </View>
      <View style={{ gap: 12 }}>{children}</View>
    </View>
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const [w, setW] = useState(1);
  const fromX = (x: number) => {
    const raw = min + clamp(x / w, 0, 1) * (max - min);
    const stepped = Math.round(raw / step) * step;
    return clamp(Number(stepped.toFixed(4)), min, max);
  };
  // Horizontal drag only, so vertical swipes still scroll the settings list.
  const pan = usePanGesture({
    runOnJS: true,
    activeOffsetX: [-6, 6],
    failOffsetY: [-14, 14],
    onActivate: (e) => onChange(fromX(e.x)),
    onUpdate: (e) => onChange(fromX(e.x)),
  });
  const tap = useTapGesture({ runOnJS: true, onActivate: (e) => onChange(fromX(e.x)) });
  const gesture = useCompetingGestures(pan, tap);
  const pct = (clamp(value, min, max) - min) / (max - min);

  return (
    <GestureDetector gesture={gesture}>
      <View style={ui.sliderHit} onLayout={(e) => setW(Math.max(1, e.nativeEvent.layout.width))} collapsable={false}>
        <View style={ui.sliderTrack}>
          <View style={[ui.sliderFill, { width: `${pct * 100}%` }]} />
        </View>
        <View style={[ui.sliderKnob, { left: pct * w - 11 }]} />
      </View>
    </GestureDetector>
  );
}

export function SliderRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  hint?: string;
  onChange: (v: number) => void;
}) {
  return (
    <View>
      <View style={ui.rowHead}>
        <Text style={ui.label}>{props.label}</Text>
        <Text style={ui.value}>{props.format ? props.format(props.value) : props.value}</Text>
      </View>
      <Slider {...props} />
      {props.hint && <Text style={ui.hint}>{props.hint}</Text>}
    </View>
  );
}

export function ToggleRow({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <View>
      <View style={[ui.rowHead, { alignItems: 'center' }]}>
        <Text style={ui.label}>{label}</Text>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: '#2c3037', true: C.goldDeep }}
          thumbColor={value ? C.gold : '#9aa0a8'}
        />
      </View>
      {hint && <Text style={ui.hint}>{hint}</Text>}
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  small,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <View style={ui.segment}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[ui.segItem, small && { paddingVertical: 5 }, value === o.value && ui.segOn]}>
          <Text style={[ui.segText, small && { fontSize: 12 }, value === o.value && ui.segTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Button({ title, onPress, gold, small }: { title: string; onPress: () => void; gold?: boolean; small?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [ui.btn, small && ui.btnSmall, gold && ui.btnGold, pressed && { opacity: 0.7 }]}>
      <Text style={[ui.btnText, small && { fontSize: 12 }, gold && { color: '#111' }]}>{title}</Text>
    </Pressable>
  );
}

export const ui = StyleSheet.create({
  card: { backgroundColor: C.panel, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 14, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: C.gold, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  label: { color: C.text, fontSize: 14 },
  value: { color: C.gold, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  hint: { color: C.dim, fontSize: 11, marginTop: 3 },
  sliderHit: { height: 30, justifyContent: 'center' },
  sliderTrack: { height: 5, borderRadius: 3, backgroundColor: '#2c3037', overflow: 'hidden' },
  sliderFill: { height: '100%', backgroundColor: C.gold },
  sliderKnob: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#f4f4f2',
    borderWidth: 3,
    borderColor: C.gold,
  },
  segment: { flexDirection: 'row', backgroundColor: '#0e1013', borderRadius: 9, padding: 3, borderWidth: 1, borderColor: C.line },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 7 },
  segOn: { backgroundColor: C.gold },
  segText: { color: C.dim, fontWeight: '600' },
  segTextOn: { color: '#111' },
  btn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: C.panelHi, borderWidth: 1, borderColor: C.line, alignItems: 'center' },
  btnSmall: { paddingHorizontal: 10, paddingVertical: 6 },
  btnGold: { backgroundColor: C.gold, borderColor: C.gold },
  btnText: { color: C.text, fontWeight: '600', fontSize: 14 },
  input: {
    backgroundColor: '#0e1013',
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    color: C.text,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 14,
  },
});
