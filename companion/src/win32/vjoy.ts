/**
 * vJoy virtual joystick binding (vJoyInterface.dll) through koffi FFI.
 *
 * Driver: vJoy 2.2.x by BrunnerInnovation (signed for Windows 10/11):
 *   https://github.com/BrunnerInnovation/vJoy/releases
 * API reference: vJoy SDK "vjoyinterface.h".
 */
import fs from 'node:fs';
import path from 'node:path';
import koffi, { type LibraryHandle } from 'koffi';

export const HID_USAGE = {
  X: 0x30,
  Y: 0x31,
  Z: 0x32,
  RX: 0x33,
  RY: 0x34,
  RZ: 0x35,
  SL0: 0x36,
  SL1: 0x37,
} as const;
export type AxisName = keyof typeof HID_USAGE;

enum VjdStat {
  OWN = 0,
  FREE = 1,
  BUSY = 2,
  MISS = 3,
  UNKN = 4,
}

type Api = {
  vJoyEnabled: () => number;
  GetvJoyVersion: () => number;
  GetVJDStatus: (id: number) => number;
  AcquireVJD: (id: number) => number;
  RelinquishVJD: (id: number) => void;
  ResetVJD: (id: number) => number;
  GetVJDAxisExist: (id: number, axis: number) => number;
  GetVJDAxisMax: (id: number, axis: number, out: number[]) => number;
  GetVJDAxisMin: (id: number, axis: number, out: number[]) => number;
  GetVJDButtonNumber: (id: number) => number;
  SetAxis: (value: number, id: number, axis: number) => number;
  SetBtn: (value: number, id: number, btn: number) => number;
};

export function findVJoyDll(configured?: string | null): string | null {
  const pf = process.env.ProgramFiles ?? 'C:\\Program Files';
  const candidates = [
    configured ?? '',
    path.join(pf, 'vJoy', 'x64', 'vJoyInterface.dll'),
    path.join(pf, 'vJoy', 'SDK', 'lib', 'amd64', 'vJoyInterface.dll'),
    path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'vJoy', 'x64', 'vJoyInterface.dll'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export class VJoyError extends Error {}

export class VJoyDevice {
  private api: Api;
  private axisRange = new Map<AxisName, { min: number; max: number }>();
  private lastAxis = new Map<AxisName, number>();
  private lastBtn = new Map<number, boolean>();
  readonly buttonCount: number;
  readonly version: string;

  private constructor(api: Api, readonly id: number) {
    this.api = api;
    this.version = '0x' + (api.GetvJoyVersion() & 0xffff).toString(16);
    for (const name of Object.keys(HID_USAGE) as AxisName[]) {
      const usage = HID_USAGE[name];
      if (!api.GetVJDAxisExist(id, usage)) continue;
      const max = [0];
      const min = [0];
      const okMax = api.GetVJDAxisMax(id, usage, max);
      const okMin = api.GetVJDAxisMin(id, usage, min);
      this.axisRange.set(name, { min: okMin ? min[0] : 0, max: okMax ? max[0] : 0x8000 });
    }
    this.buttonCount = api.GetVJDButtonNumber(id);
  }

  /** Loads the DLL and acquires device `id`. Throws VJoyError with a user-facing message. */
  static open(dllPath: string, id: number): VJoyDevice {
    let lib: LibraryHandle;
    try {
      lib = koffi.load(dllPath);
    } catch (e) {
      throw new VJoyError(`Could not load ${dllPath}: ${(e as Error).message}`);
    }
    const api: Api = {
      vJoyEnabled: lib.func('vJoyEnabled', 'int', []),
      GetvJoyVersion: lib.func('GetvJoyVersion', 'short', []),
      GetVJDStatus: lib.func('GetVJDStatus', 'int', ['uint32']),
      AcquireVJD: lib.func('AcquireVJD', 'int', ['uint32']),
      RelinquishVJD: lib.func('RelinquishVJD', 'void', ['uint32']),
      ResetVJD: lib.func('ResetVJD', 'int', ['uint32']),
      GetVJDAxisExist: lib.func('GetVJDAxisExist', 'int', ['uint32', 'uint32']),
      GetVJDAxisMax: lib.func('GetVJDAxisMax', 'int', ['uint32', 'uint32', koffi.out(koffi.pointer('int32'))]),
      GetVJDAxisMin: lib.func('GetVJDAxisMin', 'int', ['uint32', 'uint32', koffi.out(koffi.pointer('int32'))]),
      GetVJDButtonNumber: lib.func('GetVJDButtonNumber', 'int', ['uint32']),
      SetAxis: lib.func('SetAxis', 'int', ['int32', 'uint32', 'uint32']),
      SetBtn: lib.func('SetBtn', 'int', ['int', 'uint32', 'uint8']),
    };

    if (!api.vJoyEnabled()) {
      throw new VJoyError('vJoy driver is installed but not enabled. Open "Configure vJoy" and tick "Enable vJoy".');
    }
    const status = api.GetVJDStatus(id);
    if (status === VjdStat.MISS) {
      throw new VJoyError(`vJoy device ${id} does not exist. Open "Configure vJoy" and add device ${id}.`);
    }
    if (status === VjdStat.BUSY) {
      throw new VJoyError(`vJoy device ${id} is used by another program (close other feeders such as UCR/FreePIE).`);
    }
    if (status !== VjdStat.OWN && !api.AcquireVJD(id)) {
      throw new VJoyError(`Failed to acquire vJoy device ${id} (status ${VjdStat[status] ?? status}).`);
    }
    api.ResetVJD(id);
    return new VJoyDevice(api, id);
  }

  hasAxis(axis: AxisName): boolean {
    return this.axisRange.has(axis);
  }

  axes(): AxisName[] {
    return [...this.axisRange.keys()];
  }

  /** value: 0..1 across the full axis range. Skips the IOCTL if unchanged. */
  setAxis(axis: AxisName, value: number): void {
    const range = this.axisRange.get(axis);
    if (!range) return;
    const v = Math.round(range.min + Math.min(1, Math.max(0, value)) * (range.max - range.min));
    if (this.lastAxis.get(axis) === v) return;
    this.lastAxis.set(axis, v);
    this.api.SetAxis(v, this.id, HID_USAGE[axis]);
  }

  /** 1-based button index. */
  setButton(button: number, down: boolean): void {
    if (button < 1 || button > this.buttonCount) return;
    if (this.lastBtn.get(button) === down) return;
    this.lastBtn.set(button, down);
    this.api.SetBtn(down ? 1 : 0, this.id, button);
  }

  close(): void {
    try {
      this.api.ResetVJD(this.id);
      this.api.RelinquishVJD(this.id);
    } catch {
      /* ignore on shutdown */
    }
  }
}
