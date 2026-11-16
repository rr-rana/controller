/**
 * Wire protocol shared by the Android app and the Windows companion.
 *
 * Transport: one WebSocket at ws://<host>:<port>/controller.
 *  - Phone -> PC analog/button state is sent as a fixed 20-byte binary frame
 *    (state-based, idempotent; the latest frame always describes the full state).
 *  - Everything else (hello, gear requests, bindings, telemetry) is small JSON.
 *
 * This file must stay dependency-free: it is compiled by Metro (Hermes) and by tsc (Node).
 */

export const PROTOCOL_VERSION = 1;
export const SERVICE_ID = 'ets2-rr-controller';
export const DEFAULT_PORT = 8765;
export const WS_PATH = '/controller';
export const UI_WS_PATH = '/ui';
export const DISCOVERY_PATH = '/discover';

/** Phone sends at least one frame this often, even when nothing changed. */
export const HEARTBEAT_INTERVAL_MS = 200;
/** Companion neutralises all outputs if no frame arrives within this window (default). */
export const DEFAULT_FAILSAFE_TIMEOUT_MS = 600;
/** Companion sends a server heartbeat this often so the phone can detect a dead link. */
export const SERVER_HEARTBEAT_MS = 500;

// ---------------------------------------------------------------------------
// Actions (buttons)
// ---------------------------------------------------------------------------

/** Order matters: index = bit position in the frame's button mask. Append only. */
export const ACTIONS = [
  'horn',
  'pass',
  'indicatorLeft',
  'indicatorRight',
  'hazard',
  'headlights',
  'highBeam',
  'beacon',
  'wipers',
  'parkingBrake',
  'cruiseControl',
  'camera',
  'shiftUp',
  'shiftDown',
  'neutral',
] as const;

export type ActionId = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<ActionId, string> = {
  horn: 'Horn',
  pass: 'Pass light (light horn)',
  indicatorLeft: 'Left indicator',
  indicatorRight: 'Right indicator',
  hazard: 'Hazard lights',
  headlights: 'Light modes (headlights)',
  highBeam: 'High beam',
  beacon: 'Beacon',
  wipers: 'Wipers',
  parkingBrake: 'Parking brake',
  cruiseControl: 'Cruise control',
  camera: 'Next camera',
  shiftUp: 'Shift up (gear D)',
  shiftDown: 'Shift down (gear R)',
  neutral: 'Shift to neutral',
};

/** Matching ETS2 control names, shown in the setup guide / UIs. */
export const ACTION_ETS2_NAMES: Record<ActionId, string> = {
  horn: 'Horn',
  pass: 'Light horn',
  indicatorLeft: 'Left blinker',
  indicatorRight: 'Right blinker',
  hazard: 'Hazard warning',
  headlights: 'Light modes',
  highBeam: 'High beam headlights',
  beacon: 'Beacon',
  wipers: 'Wipers',
  parkingBrake: 'Parking brake',
  cruiseControl: 'Cruise control',
  camera: 'Next camera',
  shiftUp: 'Shift up',
  shiftDown: 'Shift down',
  neutral: 'Shift to neutral',
};

export function actionBit(action: ActionId): number {
  return (1 << ACTIONS.indexOf(action)) >>> 0;
}

export type Binding =
  | { type: 'vjoy'; button: number }
  | { type: 'key'; key: string }
  | { type: 'none' };

export type BindingMap = Record<ActionId, Binding>;

/** Default: every action is its own vJoy button (1-based), bound once inside ETS2. */
export function defaultBindings(): BindingMap {
  const map = {} as BindingMap;
  ACTIONS.forEach((a, i) => {
    map[a] = { type: 'vjoy', button: i + 1 };
  });
  return map;
}

export function isBinding(value: unknown): value is Binding {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.type === 'none') return true;
  if (v.type === 'vjoy') return Number.isInteger(v.button) && (v.button as number) >= 1 && (v.button as number) <= 128;
  if (v.type === 'key') return typeof v.key === 'string' && v.key.length > 0 && v.key.length <= 24;
  return false;
}

/** Merges an untrusted partial map onto defaults, dropping invalid entries. */
export function sanitizeBindings(value: unknown): BindingMap {
  const out = defaultBindings();
  if (value && typeof value === 'object') {
    for (const a of ACTIONS) {
      const b = (value as Record<string, unknown>)[a];
      if (isBinding(b)) out[a] = b;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Binary input frame (phone -> PC)
// ---------------------------------------------------------------------------

export const FRAME_MAGIC = 0xc7;
export const FRAME_SIZE = 20;

export type InputFrame = {
  /** 0..255 wrapping sequence number. */
  seq: number;
  /** -1 (full left) .. +1 (full right), dead zone already applied. */
  steer: number;
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  /** Relative camera movement since previous frame, in mouse counts (int16). */
  camDX: number;
  camDY: number;
  /** Absolute camera stick position -1..1 (for axis camera mode). */
  camAX: number;
  camAY: number;
  /** Bit i set = ACTIONS[i] held. */
  buttons: number;
};

export function emptyFrame(): InputFrame {
  return { seq: 0, steer: 0, throttle: 0, brake: 0, camDX: 0, camDY: 0, camAX: 0, camAY: 0, buttons: 0 };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const toI16 = (v: number) => Math.round(clamp(v, -1, 1) * 32767);
const toU16 = (v: number) => Math.round(clamp(v, 0, 1) * 65535);
const intI16 = (v: number) => clamp(Math.trunc(v), -32768, 32767);

/** Layout (little-endian):
 *  0 u8 magic | 1 u8 seq | 2 i16 steer | 4 u16 throttle | 6 u16 brake
 *  8 i16 camDX | 10 i16 camDY | 12 i16 camAX | 14 i16 camAY | 16 u32 buttons */
export function encodeFrame(f: InputFrame, out?: ArrayBuffer): ArrayBuffer {
  const buf = out ?? new ArrayBuffer(FRAME_SIZE);
  const dv = new DataView(buf);
  dv.setUint8(0, FRAME_MAGIC);
  dv.setUint8(1, f.seq & 0xff);
  dv.setInt16(2, toI16(f.steer), true);
  dv.setUint16(4, toU16(f.throttle), true);
  dv.setUint16(6, toU16(f.brake), true);
  dv.setInt16(8, intI16(f.camDX), true);
  dv.setInt16(10, intI16(f.camDY), true);
  dv.setInt16(12, toI16(f.camAX), true);
  dv.setInt16(14, toI16(f.camAY), true);
  dv.setUint32(16, f.buttons >>> 0, true);
  return buf;
}

export function decodeFrame(dv: DataView): InputFrame | null {
  if (dv.byteLength !== FRAME_SIZE || dv.getUint8(0) !== FRAME_MAGIC) return null;
  return {
    seq: dv.getUint8(1),
    steer: dv.getInt16(2, true) / 32767,
    throttle: dv.getUint16(4, true) / 65535,
    brake: dv.getUint16(6, true) / 65535,
    camDX: dv.getInt16(8, true),
    camDY: dv.getInt16(10, true),
    camAX: dv.getInt16(12, true) / 32767,
    camAY: dv.getInt16(14, true) / 32767,
    buttons: dv.getUint32(16, true),
  };
}

// ---------------------------------------------------------------------------
// Telemetry (PC -> phone)
// ---------------------------------------------------------------------------

export type TelemetryData = {
  game: 'ets2' | 'ats' | 'unknown';
  paused: boolean;
  /** km/h, absolute value (always >= 0). */
  speedKmh: number;
  rpm: number;
  rpmMax: number;
  /** litres */
  fuel: number;
  fuelCapacity: number;
  /** Engine gear: >0 forward, 0 neutral, <0 reverse. */
  gear: number;
  gearDashboard: number;
  /** "arcade" | "automatic" | "manual" | "hshifter" | "" */
  shifterType: string;
  engineOn: boolean;
  electricOn: boolean;
  parkBrake: boolean;
  wipers: boolean;
  blinkerLeft: boolean;
  blinkerRight: boolean;
  blinkerLeftOn: boolean;
  blinkerRightOn: boolean;
  hazard: boolean;
  lightsParking: boolean;
  lowBeam: boolean;
  highBeam: boolean;
  beacon: boolean;
  cruiseControl: boolean;
  cruiseSpeedKmh: number;
};

export type GearTarget = 'R' | 'N' | 'D';

export type ComponentStatus = { ok: boolean; message: string };

export type CompanionStatus = {
  vjoy: ComponentStatus;
  keyboard: ComponentStatus;
  telemetry: ComponentStatus;
  cameraMode: CameraMode;
};

export type CameraMode = 'mouse' | 'axis';

// ---------------------------------------------------------------------------
// JSON messages
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { t: 'hello'; v: number; device: string; link: 'usb' | 'wifi' }
  | { t: 'gear'; g: GearTarget }
  | { t: 'getBindings' }
  | { t: 'setBindings'; map: BindingMap }
  | { t: 'resetBindings' }
  | { t: 'pulse'; action: ActionId }
  | { t: 'ping'; ts: number };

export type ServerMessage =
  | { t: 'welcome'; v: number; name: string; status: CompanionStatus; bindings: BindingMap }
  | { t: 'status'; status: CompanionStatus }
  | { t: 'tel'; d: TelemetryData | null; why?: string }
  | { t: 'bindings'; map: BindingMap }
  | { t: 'pong'; ts: number }
  | { t: 'hb' }
  | { t: 'kick'; why: string };

export type DiscoveryResponse = {
  service: typeof SERVICE_ID;
  v: number;
  name: string;
  port: number;
};
