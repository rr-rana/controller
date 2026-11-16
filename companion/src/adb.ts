/**
 * USB mode: keeps `adb reverse tcp:<port> tcp:<port>` applied to every authorised
 * Android device, so the phone reaches the companion at ws://127.0.0.1:<port>.
 * Re-applies automatically after re-plugging or an adb server restart.
 */
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { COMPANION_ROOT } from './config.js';

export type AdbDevice = { serial: string; state: string; reversed: boolean; error?: string };
export type AdbStatus = { adbPath: string | null; devices: AdbDevice[]; message: string };

function run(file: string, args: string[], timeout = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim()));
      else resolve(stdout);
    });
  });
}

export async function findAdb(configured: string | null): Promise<string | null> {
  const env = process.env;
  const candidates = [
    configured,
    path.join(COMPANION_ROOT, 'platform-tools', 'adb.exe'),
    env.ANDROID_HOME && path.join(env.ANDROID_HOME, 'platform-tools', 'adb.exe'),
    env.ANDROID_SDK_ROOT && path.join(env.ANDROID_SDK_ROOT, 'platform-tools', 'adb.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
  ].filter((p): p is string => !!p);
  const found = candidates.find((p) => fs.existsSync(p));
  if (found) return found;
  try {
    const out = await run('where.exe', ['adb']);
    const first = out.split(/\r?\n/).find((l) => l.trim().toLowerCase().endsWith('adb.exe'));
    return first?.trim() ?? null;
  } catch {
    return null;
  }
}

export class AdbReverse extends EventEmitter<{ status: [AdbStatus] }> {
  status: AdbStatus = { adbPath: null, devices: [], message: 'Starting…' };
  private reversed = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private ticks = 0;
  private busy = false;

  constructor(
    private port: number,
    private configuredPath: string | null,
  ) {
    super();
  }

  async start(): Promise<void> {
    const adb = await findAdb(this.configuredPath);
    if (!adb) {
      this.set({
        adbPath: null,
        devices: [],
        message: 'adb.exe not found. Put Google "platform-tools" in companion\\platform-tools or set adbPath in config.json.',
      });
      return;
    }
    this.status.adbPath = adb;
    this.timer = setInterval(() => void this.tick(), 2500);
    await this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private set(s: AdbStatus) {
    this.status = s;
    this.emit('status', s);
  }

  private async tick() {
    const adb = this.status.adbPath;
    if (!adb || this.busy) return;
    this.busy = true;
    try {
      const out = await run(adb, ['devices']);
      const devices: AdbDevice[] = out
        .split(/\r?\n/)
        .slice(1)
        .map((l) => l.trim().split(/\s+/))
        .filter((p) => p.length >= 2 && p[0])
        .map(([serial, state]) => ({ serial, state, reversed: false }));

      const present = new Set(devices.map((d) => d.serial));
      for (const s of [...this.reversed]) if (!present.has(s)) this.reversed.delete(s);

      const verify = this.ticks++ % 4 === 0;
      for (const d of devices) {
        if (d.state !== 'device') continue;
        if (this.reversed.has(d.serial) && verify) {
          try {
            const list = await run(adb, ['-s', d.serial, 'reverse', '--list']);
            if (!list.includes(`tcp:${this.port}`)) this.reversed.delete(d.serial);
          } catch {
            this.reversed.delete(d.serial);
          }
        }
        if (!this.reversed.has(d.serial)) {
          try {
            await run(adb, ['-s', d.serial, 'reverse', `tcp:${this.port}`, `tcp:${this.port}`]);
            this.reversed.add(d.serial);
          } catch (e) {
            d.error = (e as Error).message;
          }
        }
        d.reversed = this.reversed.has(d.serial);
      }

      let message: string;
      if (devices.length === 0) message = 'No Android device over USB (enable USB debugging and plug in the phone).';
      else if (devices.some((d) => d.state === 'unauthorized'))
        message = 'Phone connected but unauthorised: accept the "Allow USB debugging" prompt on the phone.';
      else if (devices.some((d) => d.reversed)) message = `USB ready: adb reverse tcp:${this.port} active.`;
      else message = devices.map((d) => `${d.serial}: ${d.error ?? d.state}`).join('; ');
      this.set({ adbPath: adb, devices, message });
    } catch (e) {
      this.set({ adbPath: adb, devices: [], message: `adb error: ${(e as Error).message}` });
    } finally {
      this.busy = false;
    }
  }
}
