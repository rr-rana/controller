import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import type { ActionId } from '../../shared/protocol';
import { haptic } from '@/lib/haptics';
import { input, onInputReset } from '@/lib/input';
import { C } from '@/lib/theme';

type Props = {
  /** Held while the finger is down (ETS2 applies toggle/momentary semantics itself). */
  action?: ActionId;
  onPress?: () => void;
  /** Lit state from telemetry (e.g. hazard on). */
  active?: boolean;
  /** Gold outline even when idle (PASS / HORN style). */
  accent?: boolean;
  width: number;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children: (state: { pressed: boolean; active: boolean }) => ReactNode;
};

/**
 * Multi-touch safe press surface (RNGH, not the single-responder RN system), so it can be
 * held together with the wheel and pedals.
 */
export function PressButton({ action, onPress, active = false, accent = false, width, height, radius = 12, style, children }: Props) {
  const [pressed, setPressed] = useState(false);

  useEffect(() => onInputReset(() => setPressed(false)), []);

  const pan = usePanGesture({
    minDistance: 0,
    runOnJS: true,
    shouldCancelWhenOutside: false,
    onBegin: () => {
      setPressed(true);
      if (action) input.setButton(action, true);
      onPress?.();
      haptic('press');
    },
    onFinalize: () => {
      setPressed(false);
      if (action) input.setButton(action, false);
    },
  });

  const lit = active || pressed;
  return (
    <GestureDetector gesture={pan}>
      <View
        collapsable={false}
        testID={action}
        style={[
          styles.base,
          { width, height, borderRadius: radius },
          accent && styles.accent,
          lit && styles.lit,
          pressed && styles.pressed,
          style,
        ]}>
        {children({ pressed, active })}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  accent: { borderColor: C.gold, borderWidth: 1.5, backgroundColor: '#17171a' },
  lit: { borderColor: C.gold, backgroundColor: '#2a2210' },
  pressed: { backgroundColor: '#3a2e10', transform: [{ scale: 0.97 }] },
});
