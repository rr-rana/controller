import { File, Paths } from 'expo-file-system';
import { DEFAULT_PORT } from '../../shared/protocol';
import { createStore } from './store';

export type ConnectionMode = 'usb' | 'wifi';

export type Settings = {
  connectionMode: ConnectionMode;
  /** Manually entered companion IP for Wi-Fi mode (empty = auto-discover). */
  wifiHost: string;
  /** Last companion IP found by auto-discovery (tried first next time). */
  lastFoundHost: string;
  port: number;

  /** Total lock-to-lock wheel rotation in degrees (180..900). */
  steeringRange: number;
  /** Wheel degrees per degree of finger rotation (0.5..3). */
  steeringSensitivity: number;
  /** Fraction of the output treated as centre (0..0.2). */
  steeringDeadzone: number;
  autoCenter: boolean;
  /** Return-to-centre speed in degrees per second. */
  autoCenterSpeed: number;

  /** Response curve exponent: <1 = more sensitive at the start, >1 = finer control. */
  pedalCurve: number;
  /** Calibration: travel ignored at the bottom of the pedal (0..0.4). */
  throttleMin: number;
  /** Calibration: travel at which output reaches 100 % (0.5..1). */
  throttleMax: number;
  brakeMin: number;
  brakeMax: number;

  cameraSensitivity: number;
  cameraInvertY: boolean;

  haptics: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  connectionMode: 'usb',
  wifiHost: '',
  lastFoundHost: '',
  port: DEFAULT_PORT,
  steeringRange: 540,
  steeringSensitivity: 1.5,
  steeringDeadzone: 0.02,
  autoCenter: true,
  autoCenterSpeed: 540,
  pedalCurve: 1,
  throttleMin: 0.05,
  throttleMax: 0.95,
  brakeMin: 0.05,
  brakeMax: 0.95,
  cameraSensitivity: 1,
  cameraInvertY: false,
  haptics: true,
};

function openFile(): File | null {
  try {
    return new File(Paths.document, 'settings.json');
  } catch {
    return null; // e.g. web preview: settings are not persisted
  }
}
const file = openFile();

function load(): Settings {
  try {
    if (file?.exists) {
      const raw = JSON.parse(file.textSync()) as Partial<Settings>;
      const merged = { ...DEFAULT_SETTINGS };
      for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
        if (typeof raw[k] === typeof DEFAULT_SETTINGS[k]) (merged as Record<string, unknown>)[k] = raw[k];
      }
      return merged;
    }
  } catch {
    // corrupted file -> defaults
  }
  return { ...DEFAULT_SETTINGS };
}

export const settingsStore = createStore<Settings>(load());

let saveTimer: ReturnType<typeof setTimeout> | null = null;
settingsStore.subscribe(() => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!file) return;
    try {
      if (!file.exists) file.create();
      file.write(JSON.stringify(settingsStore.get()));
    } catch (e) {
      console.warn('Failed to save settings', e);
    }
  }, 300);
});

export function updateSettings(patch: Partial<Settings>) {
  settingsStore.set((s) => ({ ...s, ...patch }));
}

export function resetSettings() {
  const { connectionMode, wifiHost, lastFoundHost, port } = settingsStore.get();
  settingsStore.set({ ...DEFAULT_SETTINGS, connectionMode, wifiHost, lastFoundHost, port });
}
