import { View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { input } from '@/lib/input';
import { settingsStore } from '@/lib/settings';

/** Mouse counts per dp of finger travel at sensitivity 1.0. */
const COUNTS_PER_DP = 3;
/** Finger travel (dp) for full deflection in vJoy axis camera mode at sensitivity 1.0. */
const AXIS_FULL_DP = 140;

/**
 * Invisible touch surface: sliding a finger looks around in ETS2.
 * Sends relative motion (mouse free-look) and an absolute stick position (vJoy axis mode);
 * the companion uses whichever camera mode is selected.
 */
export function LookArea({ style }: { style: StyleProp<ViewStyle> }) {
  const pan = usePanGesture({
    minDistance: 0,
    runOnJS: true,
    shouldCancelWhenOutside: false,
    onUpdate: (e) => {
      const s = settingsStore.get();
      const k = COUNTS_PER_DP * s.cameraSensitivity;
      const inv = s.cameraInvertY ? -1 : 1;
      input.addCamera(e.changeX * k, e.changeY * k * inv);
      const full = AXIS_FULL_DP / s.cameraSensitivity;
      input.setCameraAxis(e.translationX / full, (e.translationY / full) * inv);
    },
    onFinalize: () => input.setCameraAxis(0, 0),
  });

  return (
    <GestureDetector gesture={pan}>
      <View collapsable={false} style={style} accessibilityLabel="Camera look area" />
    </GestureDetector>
  );
}
