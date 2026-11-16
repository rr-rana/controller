/**
 * ETS2/ATS telemetry reader for the RenCloud "scs-sdk-plugin" (scs-telemetry.dll, rev 12, v1.12.x).
 * https://github.com/RenCloud/scs-sdk-plugin
 *
 * The plugin publishes `scsTelemetryMap_t` in the named mapping "Local\SCSTelemetry".
 * Offsets below are derived from scs-telemetry/inc/scs-telemetry-common.hpp (tag V.1.12.1)
 * and cross-checked against the "START OF ZONE AT OFFSET n" markers in that header.
 */
import { EventEmitter } from 'node:events';
import type { TelemetryData } from '../../shared/protocol.js';
import { SharedMemoryView } from './win32/sharedmem.js';

export const SCS_MMF_NAME = 'Local\\SCSTelemetry';
export const SCS_EXPECTED_REVISION = 12;
/** We only need the first zones (up to config strings); mapping is 32 KiB. */
export const SCS_VIEW_SIZE = 4096;

export const OFF = {
  sdkActive: 0, // bool
  paused: 4, // bool
  time: 8, // u64
  simulatedTime: 16, // u64
  renderTime: 24, // u64
  pluginRevision: 40, // u32
  versionMajor: 44,
  versionMinor: 48,
  game: 52, // u32: 1 ets2, 2 ats
  gear: 504, // i32
  gearDashboard: 508, // i32
  fuelCapacity: 704, // f32 (config_f)
  engineRpmMax: 740, // f32
  speed: 948, // f32 m/s (truck_f)
  engineRpm: 952,
  cruiseControlSpeed: 988, // f32 m/s
  fuel: 1000, // f32 litres
  // truck_b (bools, 1 byte each)
  parkBrake: 1566,
  electricEnabled: 1575,
  engineEnabled: 1576,
  wipers: 1577,
  blinkerLeftActive: 1578,
  blinkerRightActive: 1579,
  blinkerLeftOn: 1580,
  blinkerRightOn: 1581,
  lightsParking: 1582,
  lightsBeamLow: 1583,
  lightsBeamHigh: 1584,
  lightsBeacon: 1585,
  lightsHazard: 1588,
  cruiseControl: 1589,
  shifterType: 3196, // char[16] (config_s, after 14 strings of 64 bytes from 2300)
} as const;

const MS_TO_KMH = 3.6;

function readCString(dv: DataView, offset: number, max: number): string {
  let s = '';
  for (let i = 0; i < max; i++) {
    const c = dv.getUint8(offset + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

const finite = (v: number) => (Number.isFinite(v) ? v : 0);

/** Pure parser (exported for tests). */
export function parseTelemetry(dv: DataView): TelemetryData {
  const b = (o: number) => dv.getUint8(o) !== 0;
  const f = (o: number) => finite(dv.getFloat32(o, true));
  const gameId = dv.getUint32(OFF.game, true);
  return {
    game: gameId === 1 ? 'ets2' : gameId === 2 ? 'ats' : 'unknown',
    paused: b(OFF.paused),
    speedKmh: Math.abs(f(OFF.speed)) * MS_TO_KMH,
    rpm: Math.max(0, f(OFF.engineRpm)),
    rpmMax: f(OFF.engineRpmMax),
    fuel: Math.max(0, f(OFF.fuel)),
    fuelCapacity: f(OFF.fuelCapacity),
    gear: dv.getInt32(OFF.gear, true),
    gearDashboard: dv.getInt32(OFF.gearDashboard, true),
    shifterType: readCString(dv, OFF.shifterType, 16),
    engineOn: b(OFF.engineEnabled),
    electricOn: b(OFF.electricEnabled),
    parkBrake: b(OFF.parkBrake),
    wipers: b(OFF.wipers),
    blinkerLeft: b(OFF.blinkerLeftActive),
    blinkerRight: b(OFF.blinkerRightActive),
    blinkerLeftOn: b(OFF.blinkerLeftOn),
    blinkerRightOn: b(OFF.blinkerRightOn),
    hazard: b(OFF.lightsHazard),
    lightsParking: b(OFF.lightsParking),
    lowBeam: b(OFF.lightsBeamLow),
    highBeam: b(OFF.lightsBeamHigh),
    beacon: b(OFF.lightsBeacon),
    cruiseControl: b(OFF.cruiseControl),
    cruiseSpeedKmh: f(OFF.cruiseControlSpeed) * MS_TO_KMH,
  };
}

export type TelemetryState =
  | { ok: true; data: TelemetryData; revision: number; gameVersion: string }
  | { ok: false; why: string };

/** Data considered frozen (game closed / hung) after this long without any timestamp change. */
const STALE_MS = 4000;
/** Timestamps may stop while the game is paused; only treat a very long freeze as stale then. */
const STALE_MS_PAUSED = 30000;

/**
 * Polls the shared memory and emits 'update' (TelemetryState) every poll.
 * Never fabricates values: when the plugin/game is unavailable it reports ok:false with a reason.
 */
export class TelemetryReader extends EventEmitter<{ update: [TelemetryState] }> {
  private mem: SharedMemoryView | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lastStamp = -1n;
  private lastChange = 0;
  private lastReopen = 0;
  state: TelemetryState = { ok: false, why: 'Telemetry not started' };

  constructor(
    private intervalMs = 50,
    private mmfName = SCS_MMF_NAME,
  ) {
    super();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.poll(), this.intervalMs);
    this.poll();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.closeMem();
  }

  /** Latest valid data or null. */
  get data(): TelemetryData | null {
    return this.state.ok ? this.state.data : null;
  }

  private closeMem() {
    this.mem?.close();
    this.mem = null;
    this.lastStamp = -1n;
  }

  private set(state: TelemetryState) {
    this.state = state;
    this.emit('update', state);
  }

  poll(): void {
    const now = Date.now();
    if (!this.mem) {
      if (now - this.lastReopen < 1000) return; // retry at most once per second
      this.lastReopen = now;
      this.mem = SharedMemoryView.open(this.mmfName, SCS_VIEW_SIZE);
      if (!this.mem) {
        this.set({
          ok: false,
          why: 'ETS2 not running, or scs-telemetry.dll is not installed in bin\\win_x64\\plugins',
        });
        return;
      }
      this.lastChange = now;
    }
    const dv = this.mem.view;
    if (!dv.getUint8(OFF.sdkActive)) {
      this.set({ ok: false, why: 'Game is not running (telemetry SDK inactive)' });
      this.closeMem(); // release our handle so a closed game's mapping can disappear
      return;
    }
    const stamp = dv.getBigUint64(OFF.time, true) ^ dv.getBigUint64(OFF.renderTime, true);
    if (stamp !== this.lastStamp) {
      this.lastStamp = stamp;
      this.lastChange = now;
    } else if (now - this.lastChange > (dv.getUint8(OFF.paused) ? STALE_MS_PAUSED : STALE_MS)) {
      this.set({ ok: false, why: 'Telemetry frozen (game closed, loading or crashed)' });
      this.closeMem();
      return;
    }
    const revision = dv.getUint32(OFF.pluginRevision, true);
    if (revision !== SCS_EXPECTED_REVISION) {
      this.set({
        ok: false,
        why: `Unsupported scs-telemetry plugin revision ${revision} (expected ${SCS_EXPECTED_REVISION}, plugin v1.12.x)`,
      });
      return;
    }
    this.set({
      ok: true,
      revision,
      gameVersion: `${dv.getUint32(OFF.versionMajor, true)}.${dv.getUint32(OFF.versionMinor, true)}`,
      data: parseTelemetry(dv),
    });
  }
}
