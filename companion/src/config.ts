import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_FAILSAFE_TIMEOUT_MS,
  DEFAULT_PORT,
  defaultBindings,
  sanitizeBindings,
  type BindingMap,
  type CameraMode,
} from '../../shared/protocol.js';
import { HID_USAGE, type AxisName } from './win32/vjoy.js';

/** companion/ (this file compiles to companion/dist/companion/src/config.js). */
export const COMPANION_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const CONFIG_PATH = path.join(COMPANION_ROOT, 'config.json');

export type AxisAssignment = {
  steer: AxisName;
  throttle: AxisName;
  brake: AxisName;
  camX: AxisName;
  camY: AxisName;
};

export type CompanionConfig = {
  /** TCP port for WebSocket + discovery + dashboard. */
  port: number;
  /** "0.0.0.0" = USB + Wi-Fi. "127.0.0.1" = USB (adb reverse) only, invisible to the LAN. */
  listenHost: string;
  vjoyDevice: number;
  /** null = auto-detect in Program Files\vJoy. */
  vjoyDllPath: string | null;
  /** null = auto-detect (Android SDK, ./platform-tools, PATH). */
  adbPath: string | null;
  autoAdbReverse: boolean;
  /** "mouse" = relative mouse movement (ETS2 free look). "axis" = vJoy camX/camY axes. */
  cameraMode: CameraMode;
  /** Extra multiplier applied to phone camera deltas in mouse mode. */
  mouseScale: number;
  /** Minimum time a button stays pressed so ETS2 never misses a short tap. */
  minPressMs: number;
  failsafeTimeoutMs: number;
  openDashboard: boolean;
  axes: AxisAssignment;
  bindings: BindingMap;
};

export function defaultConfig(): CompanionConfig {
  return {
    port: DEFAULT_PORT,
    listenHost: '0.0.0.0',
    vjoyDevice: 1,
    vjoyDllPath: null,
    adbPath: null,
    autoAdbReverse: true,
    cameraMode: 'mouse',
    mouseScale: 1,
    minPressMs: 60,
    failsafeTimeoutMs: DEFAULT_FAILSAFE_TIMEOUT_MS,
    openDashboard: true,
    axes: { steer: 'X', throttle: 'Y', brake: 'Z', camX: 'RX', camY: 'RY' },
    bindings: defaultBindings(),
  };
}

const isAxis = (v: unknown): v is AxisName => typeof v === 'string' && v in HID_USAGE;
const num = (v: unknown, def: number, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;

export function sanitizeConfig(raw: unknown): CompanionConfig {
  const d = defaultConfig();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const axesRaw = (r.axes ?? {}) as Record<string, unknown>;
  const axes = { ...d.axes };
  for (const k of Object.keys(axes) as (keyof AxisAssignment)[]) if (isAxis(axesRaw[k])) axes[k] = axesRaw[k];
  return {
    port: Math.round(num(r.port, d.port, 1024, 65535)),
    listenHost: typeof r.listenHost === 'string' && r.listenHost ? r.listenHost : d.listenHost,
    vjoyDevice: Math.round(num(r.vjoyDevice, d.vjoyDevice, 1, 16)),
    vjoyDllPath: typeof r.vjoyDllPath === 'string' && r.vjoyDllPath ? r.vjoyDllPath : null,
    adbPath: typeof r.adbPath === 'string' && r.adbPath ? r.adbPath : null,
    autoAdbReverse: typeof r.autoAdbReverse === 'boolean' ? r.autoAdbReverse : d.autoAdbReverse,
    cameraMode: r.cameraMode === 'axis' ? 'axis' : 'mouse',
    mouseScale: num(r.mouseScale, d.mouseScale, 0.05, 20),
    minPressMs: Math.round(num(r.minPressMs, d.minPressMs, 0, 500)),
    failsafeTimeoutMs: Math.round(num(r.failsafeTimeoutMs, d.failsafeTimeoutMs, 250, 5000)),
    openDashboard: typeof r.openDashboard === 'boolean' ? r.openDashboard : d.openDashboard,
    axes,
    bindings: sanitizeBindings(r.bindings),
  };
}

export function loadConfig(file = CONFIG_PATH): CompanionConfig {
  let cfg: CompanionConfig;
  try {
    cfg = sanitizeConfig(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[config] ${file} is invalid (${(e as Error).message}); using defaults.`);
    }
    cfg = defaultConfig();
  }
  saveConfig(cfg, file); // write back normalised config so users can see every option
  return cfg;
}

export function saveConfig(cfg: CompanionConfig, file = CONFIG_PATH): void {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n');
  fs.renameSync(tmp, file);
}
