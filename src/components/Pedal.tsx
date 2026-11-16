import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { haptic } from '@/lib/haptics';
import { input, onInputReset } from '@/lib/input';
import { settingsStore } from '@/lib/settings';
import { C, clamp } from '@/lib/theme';

export type PedalKind = 'brake' | 'throttle';

/**
 * Maps the finger position on the pedal (0 = bottom edge, 1 = top edge) to output 0..1
 * using the calibration window [min, max] and the response curve exponent.
 */
export function pedalResponse(travel: number, min: number, max: number, curve: number): number {
  const span = Math.max(0.05, max - min);
  const n = clamp((travel - min) / span, 0, 1);
  return Math.pow(n, curve);
}

export function Pedal({ kind, width, height }: { kind: PedalKind; width: number; height: number }) {
  const value = useSharedValue(0);

  const set = (v: number) => {
    value.set(v);
    if (kind === 'brake') input.setBrake(v);
    else input.setThrottle(v);
  };

  const fromY = (y: number) => {
    const s = settingsStore.get();
    const travel = 1 - clamp(y / height, 0, 1);
    return kind === 'brake'
      ? pedalResponse(travel, s.brakeMin, s.brakeMax, s.pedalCurve)
      : pedalResponse(travel, s.throttleMin, s.throttleMax, s.pedalCurve);
  };

  useEffect(() => onInputReset(() => value.set(0)), [value]);

  const pan = usePanGesture({
    minDistance: 0,
    runOnJS: true,
    shouldCancelWhenOutside: false,
    hitSlop: { top: 10, bottom: 10, left: 6, right: 6 },
    onBegin: (e) => {
      haptic('press');
      set(fromY(e.y));
    },
    onUpdate: (e) => set(fromY(e.y)),
    onFinalize: () => set(0),
  });

  const plateStyle = useAnimatedStyle(() => {
    const v = value.get();
    return {
      transform: [{ perspective: 500 }, { rotateX: `${v * 16}deg` }, { scale: 1 - v * 0.05 }],
    };
  });
  const shadeStyle = useAnimatedStyle(() => ({ opacity: value.get() * 0.35 }));
  const fillStyle = useAnimatedStyle(() => ({ height: `${value.get() * 100}%` }));

  const isBrake = kind === 'brake';
  const r = Math.min(width, height) * 0.12;

  return (
    <GestureDetector gesture={pan}>
      <View style={{ width, height }} collapsable={false} testID={`pedal-${kind}`}>
        <Animated.View style={[{ width, height }, plateStyle]}>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id={`m${kind}`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#f3f4f6" />
                <Stop offset="0.45" stopColor="#b9bdc3" />
                <Stop offset="1" stopColor="#7d828a" />
              </LinearGradient>
            </Defs>
            <Rect x={1} y={3} width={width - 2} height={height - 3} rx={r} fill="#000" opacity={0.5} />
            <Rect x={0} y={0} width={width - 2} height={height - 4} rx={r} fill={`url(#m${kind})`} stroke="#d8dade" strokeWidth={1} />
            {isBrake
              ? [0, 1, 2, 3].map((i) => (
                  <Rect
                    key={i}
                    x={width * 0.1}
                    y={height * (0.1 + i * 0.13)}
                    width={width * 0.78}
                    height={height * 0.075}
                    rx={height * 0.035}
                    fill="#1b1c1f"
                  />
                ))
              : [0, 1, 2, 3, 4].map((i) => (
                  <Rect
                    key={i}
                    x={width * (0.13 + i * 0.155)}
                    y={height * 0.07}
                    width={width * 0.09}
                    height={height * 0.68}
                    rx={width * 0.045}
                    fill="#1b1c1f"
                  />
                ))}
          </Svg>
          <Text style={[styles.label, { fontSize: Math.max(12, width * 0.17), bottom: height * 0.07 }]}>
            {isBrake ? 'BRAKE' : 'ACC'}
          </Text>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shade, { borderRadius: r }, shadeStyle]} />
        </Animated.View>
        {/* analog level indicator */}
        <View pointerEvents="none" style={[styles.track, { height: height * 0.8, top: height * 0.1 }, isBrake ? { left: -9 } : { right: -9 }]}>
          <Animated.View style={[styles.fill, fillStyle]} />
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  label: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#1d1e21',
    fontWeight: '800',
    letterSpacing: 1,
  },
  shade: { backgroundColor: '#000' },
  track: {
    position: 'absolute',
    width: 4,
    borderRadius: 2,
    backgroundColor: C.line,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  fill: { width: '100%', backgroundColor: C.gold, borderRadius: 2 },
});
