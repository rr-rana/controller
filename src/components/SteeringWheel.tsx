import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { haptic } from '@/lib/haptics';
import { input, onInputReset } from '@/lib/input';
import { settingsStore } from '@/lib/settings';
import { C, clamp } from '@/lib/theme';

/** Converts wheel degrees to the -1..1 axis value using range and dead zone. */
export function wheelToAxis(deg: number, rangeDeg: number, deadzone: number): number {
  const v = clamp(deg / (rangeDeg / 2), -1, 1);
  const a = Math.abs(v);
  if (a <= deadzone) return 0;
  return Math.sign(v) * ((a - deadzone) / (1 - deadzone));
}

type DragState = {
  wheel: number;
  lastAngle: number;
  tracking: boolean;
  raf: number;
  lastT: number;
  atLock: boolean;
};

export function SteeringWheel({ size }: { size: number }) {
  const rotation = useSharedValue(0);
  const drag = useRef<DragState>({ wheel: 0, lastAngle: 0, tracking: false, raf: 0, lastT: 0, atLock: false });

  const apply = (deg: number) => {
    const st = drag.current;
    const s = settingsStore.get();
    st.wheel = deg;
    rotation.set(deg);
    input.setSteer(wheelToAxis(deg, s.steeringRange, s.steeringDeadzone));
    const atLock = Math.abs(deg) >= s.steeringRange / 2 - 0.01;
    if (atLock && !st.atLock) haptic('tick');
    st.atLock = atLock;
  };

  const stopCentering = () => {
    const st = drag.current;
    if (st.raf) cancelAnimationFrame(st.raf);
    st.raf = 0;
  };

  const startCentering = () => {
    stopCentering();
    const st = drag.current;
    const step = (t: number) => {
      const dt = Math.min(0.05, (t - st.lastT) / 1000);
      st.lastT = t;
      const speed = settingsStore.get().autoCenterSpeed;
      const w = st.wheel;
      // constant speed, easing out over the last ~60 degrees
      const move = speed * dt * (0.3 + 0.7 * Math.min(1, Math.abs(w) / 60));
      const next = Math.abs(w) <= move ? 0 : w - Math.sign(w) * move;
      apply(next);
      st.raf = next === 0 ? 0 : requestAnimationFrame(step);
    };
    st.raf = requestAnimationFrame((t) => {
      st.lastT = t;
      step(t);
    });
  };

  useEffect(
    () =>
      onInputReset(() => {
        stopCentering();
        const st = drag.current;
        st.wheel = 0;
        st.tracking = false;
        rotation.set(0);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const center = size / 2;
  const deadRadius = size * 0.09; // angle is unstable near the hub

  const pan = usePanGesture({
    minDistance: 0,
    runOnJS: true,
    shouldCancelWhenOutside: false,
    onBegin: (e) => {
      stopCentering();
      const st = drag.current;
      const dx = e.x - center;
      const dy = e.y - center;
      st.tracking = Math.hypot(dx, dy) > deadRadius;
      st.lastAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
    },
    onUpdate: (e) => {
      const st = drag.current;
      const dx = e.x - center;
      const dy = e.y - center;
      const a = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (Math.hypot(dx, dy) <= deadRadius) {
        st.tracking = false;
        return;
      }
      if (!st.tracking) {
        st.tracking = true;
        st.lastAngle = a;
        return;
      }
      let d = a - st.lastAngle;
      if (d > 180) d -= 360;
      else if (d < -180) d += 360;
      st.lastAngle = a;
      const s = settingsStore.get();
      const half = s.steeringRange / 2;
      apply(clamp(st.wheel + d * s.steeringSensitivity, -half, half));
    },
    onFinalize: () => {
      drag.current.tracking = false;
      if (settingsStore.get().autoCenter) startCentering();
    },
  });

  const wheelStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get()}deg` }] }));

  return (
    <GestureDetector gesture={pan}>
      {/* Static container: touch coordinates must not be affected by the rotation. */}
      <View style={{ width: size, height: size }} collapsable={false} testID="wheel">
        <Animated.View style={[{ width: size, height: size }, wheelStyle]}>
          <WheelArt size={size} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

function WheelArt({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        <RadialGradient id="rim" cx="50%" cy="45%" r="55%">
          <Stop offset="0.78" stopColor="#2b2d31" />
          <Stop offset="0.9" stopColor="#1a1b1e" />
          <Stop offset="1" stopColor="#0c0d0f" />
        </RadialGradient>
        <LinearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.metalHi} />
          <Stop offset="0.5" stopColor={C.metalMid} />
          <Stop offset="1" stopColor={C.metalLo} />
        </LinearGradient>
        <RadialGradient id="hub" cx="45%" cy="40%" r="65%">
          <Stop offset="0" stopColor="#2e3035" />
          <Stop offset="1" stopColor="#111214" />
        </RadialGradient>
      </Defs>

      {/* drop shadow */}
      <Circle cx="100" cy="103" r="96" fill="#000" opacity={0.45} />
      {/* rim */}
      <Circle cx="100" cy="100" r="86" stroke="url(#rim)" strokeWidth={22} fill="none" />
      <Circle cx="100" cy="100" r="97" stroke="#3a3c41" strokeWidth={1.2} fill="none" />
      <Circle cx="100" cy="100" r="75" stroke="#08090a" strokeWidth={1.5} fill="none" />
      {/* leather stitching */}
      <Circle cx="100" cy="100" r="93" stroke="#4a4c51" strokeWidth={0.8} strokeDasharray="2 3" fill="none" />
      <Circle cx="100" cy="100" r="79" stroke="#4a4c51" strokeWidth={0.8} strokeDasharray="2 3" fill="none" />
      {/* top centre marker */}
      <Rect x="95" y="3" width="10" height="22" rx="1.5" fill={C.gold} />

      {/* spokes */}
      <Path d="M18 92 C40 86 62 88 74 98 L76 122 C60 130 38 130 20 116 Z" fill="url(#metal)" />
      <Path d="M182 92 C160 86 138 88 126 98 L124 122 C140 130 162 130 180 116 Z" fill="url(#metal)" />
      <Path d="M86 126 L114 126 L110 182 C104 184 96 184 90 182 Z" fill="url(#metal)" />
      {/* spoke inserts */}
      <Path d="M34 97 C46 93 58 94 66 100 L67 116 C56 121 44 121 34 113 Z" fill="#17181b" />
      <Path d="M166 97 C154 93 142 94 134 100 L133 116 C144 121 156 121 166 113 Z" fill="#17181b" />
      <Path d="M93 136 L107 136 L104 172 L96 172 Z" fill="#17181b" />
      {/* spoke buttons: arrows (left), horn (right) */}
      <G stroke="#d9dbde" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Path d="M41 107 h8 M41 107 l3 -3 M41 107 l3 3" />
        <Path d="M52 107 h8 M60 107 l-3 -3 M60 107 l-3 3" />
        <Path d="M142 104 c3 1 5 1.3 9 1.3 s6 -1.3 8 -3 v10 c-2 -1.7 -4 -3 -8 -3 s-6 .3 -9 1.3 Z" />
      </G>

      {/* hub */}
      <Circle cx="100" cy="106" r="33" fill="#0d0e10" />
      <Circle cx="100" cy="104" r="31" fill="url(#hub)" stroke="#34363b" strokeWidth={1.2} />
      <Path d="M86 92 A18 18 0 0 1 114 92" stroke={C.gold} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <SvgText
        x="100"
        y="114"
        fill="#f1f1ef"
        fontSize="24"
        fontWeight="800"
        fontStyle="italic"
        textAnchor="middle"
        letterSpacing="1">
        RR
      </SvgText>
    </Svg>
  );
}
