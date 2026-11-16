import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { settingsStore } from './settings';

type Kind = 'press' | 'release' | 'tick' | 'confirm';

const ANDROID: Record<Kind, Haptics.AndroidHaptics> = {
  press: Haptics.AndroidHaptics.Virtual_Key,
  release: Haptics.AndroidHaptics.Virtual_Key_Release,
  tick: Haptics.AndroidHaptics.Segment_Tick,
  confirm: Haptics.AndroidHaptics.Confirm,
};

/** Fire-and-forget haptic feedback, respecting the user's setting. */
export function haptic(kind: Kind = 'press') {
  if (!settingsStore.get().haptics) return;
  const p =
    Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(ANDROID[kind])
      : kind === 'tick'
        ? Haptics.selectionAsync()
        : Haptics.impactAsync(kind === 'release' ? Haptics.ImpactFeedbackStyle.Soft : Haptics.ImpactFeedbackStyle.Light);
  p.catch(() => {});
}
