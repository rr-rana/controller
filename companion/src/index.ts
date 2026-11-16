/**
 * ETS2 RR Controller – Windows companion entry point.
 *   phone --(WebSocket, USB via adb reverse or Wi-Fi)--> companion --> vJoy / SendInput --> ETS2
 *   ETS2 --(scs-telemetry.dll shared memory)--> companion --> phone
 */
import { exec } from 'node:child_process';
import type { CompanionStatus, ComponentStatus } from '../../shared/protocol.js';
import { AdbReverse } from './adb.js';
import { CONFIG_PATH, loadConfig } from './config.js';
import { GearSelector } from './gear.js';
import { OutputController } from './output.js';
import { CompanionServer, lanAddresses } from './server.js';
import { TelemetryReader } from './telemetry.js';
import { SendInputApi } from './win32/sendinput.js';
import { VJoyDevice, VJoyError, findVJoyDll } from './win32/vjoy.js';

const verbose = process.argv.includes('--verbose');
const log = (m: string) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);

if (process.platform !== 'win32') {
  console.error('The companion only runs on Windows (vJoy, SendInput and SCS telemetry are Windows APIs).');
  process.exit(1);
}

const cfg = loadConfig();

// ---------------------------------------------------------------- keyboard/mouse
let input: SendInputApi | null = null;
let keyboardStatus: ComponentStatus;
try {
  input = new SendInputApi();
  const err = input.selfTest();
  keyboardStatus = err ? { ok: false, message: err } : { ok: true, message: 'SendInput ready' };
} catch (e) {
  keyboardStatus = { ok: false, message: `SendInput unavailable: ${(e as Error).message}` };
}

// ---------------------------------------------------------------- vJoy
let vjoy: VJoyDevice | null = null;
let vjoyStatus: ComponentStatus = { ok: false, message: 'Not initialised' };

function tryOpenVJoy(): boolean {
  const dll = findVJoyDll(cfg.vjoyDllPath);
  if (!dll) {
    vjoyStatus = {
      ok: false,
      message: 'vJoy not installed (vJoyInterface.dll not found). Install vJoy 2.2.x from github.com/BrunnerInnovation/vJoy/releases',
    };
    return false;
  }
  try {
    vjoy = VJoyDevice.open(dll, cfg.vjoyDevice);
    const missing = (['steer', 'throttle', 'brake'] as const).filter((k) => !vjoy!.hasAxis(cfg.axes[k]));
    const warn = [
      missing.length ? `missing axes ${missing.map((k) => cfg.axes[k]).join(',')}` : '',
      vjoy.buttonCount < 15 ? `only ${vjoy.buttonCount} buttons (set 32 in Configure vJoy)` : '',
    ].filter(Boolean);
    vjoyStatus = {
      ok: warn.length === 0,
      message: `vJoy device ${cfg.vjoyDevice}: axes ${vjoy.axes().join(',')}, ${vjoy.buttonCount} buttons` +
        (warn.length ? ` – WARNING: ${warn.join('; ')}` : ''),
    };
    return true;
  } catch (e) {
    vjoyStatus = { ok: false, message: e instanceof VJoyError ? e.message : `vJoy error: ${(e as Error).message}` };
    return false;
  }
}
tryOpenVJoy();

// ---------------------------------------------------------------- core
const telemetry = new TelemetryReader();
const out = new OutputController(cfg, vjoy, input, verbose ? log : undefined);
const gear = new GearSelector(out, () => telemetry.data, log);
const adb = cfg.autoAdbReverse ? new AdbReverse(cfg.port, cfg.adbPath) : null;

const status = (): CompanionStatus => {
  const t = telemetry.state;
  return {
    vjoy: vjoyStatus,
    keyboard: keyboardStatus,
    telemetry: t.ok ? { ok: true, message: `${t.data.game.toUpperCase()} ${t.gameVersion}` } : { ok: false, message: t.why },
    cameraMode: cfg.cameraMode,
  };
};

const server = new CompanionServer({ cfg, out, gear, telemetry, adb, status, log });

let lastTelOk: boolean | null = null;
telemetry.on('update', (s) => {
  if (s.ok !== lastTelOk) {
    lastTelOk = s.ok;
    log(`Telemetry: ${s.ok ? 'connected' : s.why}`);
    server.broadcastStatus();
  }
});

// Retry vJoy periodically so users can install/configure it without restarting.
const vjoyRetry = setInterval(() => {
  if (vjoy) return;
  if (tryOpenVJoy()) {
    out.setVJoy(vjoy);
    log(vjoyStatus.message);
    server.broadcastStatus();
  }
}, 5000);

let lastAdbMsg = '';
adb?.on('status', (s) => {
  if (s.message !== lastAdbMsg) {
    lastAdbMsg = s.message;
    log(`USB: ${s.message}`);
  }
});

async function main() {
  try {
    await server.listen();
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    console.error(
      err.code === 'EADDRINUSE'
        ? `Port ${cfg.port} is already in use. Is the companion already running? (change "port" in ${CONFIG_PATH})`
        : `Failed to start server: ${err.message}`,
    );
    process.exit(1);
  }
  telemetry.start();
  void adb?.start();

  const dash = `http://127.0.0.1:${cfg.port}/`;
  console.log('');
  console.log('  ETS2 RR Controller – companion');
  console.log('  ------------------------------');
  console.log(`  Dashboard : ${dash}`);
  console.log(`  USB       : phone connects to 127.0.0.1:${cfg.port} via adb reverse`);
  if (cfg.listenHost === '0.0.0.0') {
    for (const a of lanAddresses()) console.log(`  Wi-Fi     : ${a}:${cfg.port}`);
  } else {
    console.log(`  Wi-Fi     : disabled (listenHost=${cfg.listenHost})`);
  }
  console.log(`  vJoy      : ${vjoyStatus.message}`);
  console.log(`  Keyboard  : ${keyboardStatus.message}`);
  console.log(`  Config    : ${CONFIG_PATH}`);
  console.log('  Press Ctrl+C to quit.\n');

  if (cfg.openDashboard && !process.argv.includes('--no-open')) exec(`start "" "${dash}"`, { windowsHide: true });
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log('Shutting down: releasing all inputs');
  clearInterval(vjoyRetry);
  out.neutralize();
  server.close();
  telemetry.stop();
  adb?.stop();
  vjoy?.close();
  setTimeout(() => process.exit(0), 100);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGBREAK', shutdown);
process.on('uncaughtException', (e) => {
  console.error('Fatal error:', e);
  out.neutralize();
  vjoy?.close();
  process.exit(1);
});

void main();
