import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WebSocket } from 'ws';
import {
  DISCOVERY_PATH,
  FRAME_SIZE,
  SERVICE_ID,
  WS_PATH,
  actionBit,
  decodeFrame,
  emptyFrame,
  encodeFrame,
  sanitizeBindings,
  type ServerMessage,
  type TelemetryData,
} from '../../shared/protocol.js';
import { defaultConfig } from '../src/config.js';
import { GearSelector } from '../src/gear.js';
import { OutputController } from '../src/output.js';
import { CompanionServer } from '../src/server.js';
import { OFF, SCS_VIEW_SIZE, TelemetryReader, parseTelemetry } from '../src/telemetry.js';
import { SendInputApi, keyNameToVk } from '../src/win32/sendinput.js';
import { SharedMemoryView } from '../src/win32/sharedmem.js';
import { VJoyDevice, VJoyError } from '../src/win32/vjoy.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class FakeVJoy {
  axes: Record<string, number> = {};
  buttons: Record<number, boolean> = {};
  calls: string[] = [];
  hasAxis() {
    return true;
  }
  setAxis(axis: string, v: number) {
    this.axes[axis] = v;
  }
  setButton(b: number, d: boolean) {
    if (this.buttons[b] === d) return;
    this.buttons[b] = d;
    this.calls.push(`${b}:${d ? 1 : 0}`);
  }
}

class FakeInput {
  keys: string[] = [];
  mouse: [number, number][] = [];
  key(vk: number, down: boolean) {
    this.keys.push(`${vk}:${down ? 1 : 0}`);
    return true;
  }
  moveMouse(dx: number, dy: number) {
    this.mouse.push([dx, dy]);
    return true;
  }
}

function makeOutput(minPressMs = 0) {
  const cfg = defaultConfig();
  cfg.minPressMs = minPressMs;
  const vj = new FakeVJoy();
  const inp = new FakeInput();
  const out = new OutputController(cfg, vj as unknown as VJoyDevice, inp as unknown as SendInputApi);
  return { cfg, vj, inp, out };
}

describe('protocol', () => {
  it('round-trips an input frame', () => {
    const f = { ...emptyFrame(), seq: 300, steer: -0.5, throttle: 0.25, brake: 1, camDX: -12, camDY: 40000, camAX: 0.5, camAY: -1, buttons: actionBit('horn') | actionBit('neutral') };
    const buf = encodeFrame(f);
    assert.equal(buf.byteLength, FRAME_SIZE);
    const d = decodeFrame(new DataView(buf))!;
    assert.equal(d.seq, 300 & 0xff);
    assert.ok(Math.abs(d.steer + 0.5) < 1e-4);
    assert.ok(Math.abs(d.throttle - 0.25) < 1e-4);
    assert.equal(d.brake, 1);
    assert.equal(d.camDX, -12);
    assert.equal(d.camDY, 32767, 'clamped to int16');
    assert.equal(d.buttons, f.buttons);
  });

  it('rejects bad frames and sanitises bindings', () => {
    assert.equal(decodeFrame(new DataView(new ArrayBuffer(FRAME_SIZE))), null);
    const b = sanitizeBindings({ horn: { type: 'key', key: 'H' }, pass: { type: 'vjoy', button: 999 }, bogus: 1 });
    assert.deepEqual(b.horn, { type: 'key', key: 'H' });
    assert.deepEqual(b.pass, { type: 'vjoy', button: 2 }, 'invalid entry falls back to default');
  });
});

describe('telemetry (real Win32 named mapping laid out like scs-telemetry rev 12)', () => {
  const name = `Local\\SCSTelemetryTest_${process.pid}`;

  function writeSample(dv: DataView) {
    dv.setUint8(OFF.sdkActive, 1);
    dv.setUint32(OFF.pluginRevision, 12, true);
    dv.setUint32(OFF.versionMajor, 1, true);
    dv.setUint32(OFF.versionMinor, 18, true);
    dv.setUint32(OFF.game, 1, true);
    dv.setBigUint64(OFF.time, 1000n, true);
    dv.setInt32(OFF.gear, -1, true);
    dv.setInt32(OFF.gearDashboard, -1, true);
    dv.setFloat32(OFF.fuelCapacity, 800, true);
    dv.setFloat32(OFF.engineRpmMax, 2500, true);
    dv.setFloat32(OFF.speed, -2.5, true); // reversing at 9 km/h
    dv.setFloat32(OFF.engineRpm, 1234.5, true);
    dv.setFloat32(OFF.fuel, 624, true);
    dv.setFloat32(OFF.cruiseControlSpeed, 25, true);
    dv.setUint8(OFF.parkBrake, 1);
    dv.setUint8(OFF.blinkerLeftActive, 1);
    dv.setUint8(OFF.lightsHazard, 1);
    dv.setUint8(OFF.lightsBeamLow, 1);
    dv.setUint8(OFF.cruiseControl, 1);
    'automatic'.split('').forEach((c, i) => dv.setUint8(OFF.shifterType + i, c.charCodeAt(0)));
  }

  it('parses the documented offsets', () => {
    const dv = new DataView(new ArrayBuffer(SCS_VIEW_SIZE));
    writeSample(dv);
    const t = parseTelemetry(dv);
    assert.equal(t.game, 'ets2');
    assert.ok(Math.abs(t.speedKmh - 9) < 1e-3);
    assert.ok(Math.abs(t.rpm - 1234.5) < 1e-3);
    assert.equal(t.fuel, 624);
    assert.equal(t.fuelCapacity, 800);
    assert.equal(t.gear, -1);
    assert.equal(t.shifterType, 'automatic');
    assert.equal(t.parkBrake, true);
    assert.equal(t.blinkerLeft, true);
    assert.equal(t.blinkerRight, false);
    assert.equal(t.hazard, true);
    assert.equal(t.lowBeam, true);
    assert.equal(t.cruiseControl, true);
    assert.ok(Math.abs(t.cruiseSpeedKmh - 90) < 1e-3);
  });

  it('reads through OpenFileMapping/MapViewOfFile and reports unavailable states honestly', () => {
    const reader = new TelemetryReader(1000, name);
    reader.poll();
    assert.equal((reader.state as { ok: boolean }).ok, false, 'no mapping yet');

    const mem = SharedMemoryView.create(name, 32 * 1024);
    try {
      writeSample(mem.view);
      (reader as unknown as { lastReopen: number }).lastReopen = 0;
      reader.poll();
      assert.equal((reader.state as { ok: boolean }).ok, true, JSON.stringify(reader.state));
      assert.equal(reader.data?.fuel, 624);

      mem.view.setUint32(OFF.pluginRevision, 11, true);
      mem.view.setBigUint64(OFF.time, 1001n, true);
      reader.poll();
      assert.equal((reader.state as { ok: boolean }).ok, false);
      assert.match((reader.state as { why: string }).why, /revision 11/);

      mem.view.setUint8(OFF.sdkActive, 0);
      reader.poll();
      assert.equal((reader.state as { ok: boolean }).ok, false);
      assert.match((reader.state as { why: string }).why, /not running/);
    } finally {
      reader.stop();
      mem.close();
    }
  });
});

describe('win32', () => {
  it('SendInput accepts our 40-byte INPUT layout (zero-length mouse move)', () => {
    const api = new SendInputApi();
    assert.equal(api.selfTest(), null);
  });

  it('maps key names', () => {
    assert.equal(keyNameToVk('h'), 0x48);
    assert.equal(keyNameToVk('Space'), 0x20);
    assert.equal(keyNameToVk('['), 0xdb);
    assert.equal(keyNameToVk('F12'), 0x7b);
    assert.equal(keyNameToVk('nope'), null);
  });

  it('vJoy reports a clear error when the DLL cannot be loaded', () => {
    assert.throws(() => VJoyDevice.open('C:\\does\\not\\exist\\vJoyInterface.dll', 1), VJoyError);
  });
});

describe('output controller', () => {
  it('maps axes and holds buttons while pressed', () => {
    const { vj, out } = makeOutput();
    out.applyFrame({ ...emptyFrame(), steer: 1, throttle: 0.5, brake: 0.2, buttons: actionBit('horn') });
    assert.equal(vj.axes.X, 1);
    assert.equal(vj.axes.Y, 0.5);
    assert.ok(Math.abs(vj.axes.Z - 0.2) < 1e-9);
    assert.equal(vj.buttons[1], true);
    out.applyFrame({ ...emptyFrame(), buttons: 0 });
    assert.equal(vj.buttons[1], false);
    assert.equal(vj.axes.X, 0.5);
  });

  it('enforces the minimum press time for short taps', async () => {
    const { vj, out } = makeOutput(50);
    out.applyFrame({ ...emptyFrame(), buttons: actionBit('indicatorLeft') });
    out.applyFrame({ ...emptyFrame(), buttons: 0 });
    assert.equal(vj.buttons[3], true, 'still held right after release');
    await sleep(80);
    assert.equal(vj.buttons[3], false);
  });

  it('neutralize releases everything (connection loss)', () => {
    const { vj, inp, cfg, out } = makeOutput(1000);
    cfg.bindings.horn = { type: 'key', key: 'H' };
    out.setBindings(cfg.bindings);
    out.applyFrame({ ...emptyFrame(), steer: -1, throttle: 1, buttons: actionBit('horn') | actionBit('pass') });
    out.neutralize();
    assert.equal(vj.axes.X, 0.5);
    assert.equal(vj.axes.Y, 0);
    assert.equal(vj.buttons[2], false);
    assert.deepEqual(inp.keys, ['72:1', '72:0']);
  });

  it('shared targets are reference counted', () => {
    const { vj, cfg, out } = makeOutput();
    cfg.bindings.hazard = { type: 'vjoy', button: 1 }; // same as horn
    out.applyFrame({ ...emptyFrame(), buttons: actionBit('horn') | actionBit('hazard') });
    out.applyFrame({ ...emptyFrame(), buttons: actionBit('hazard') });
    assert.equal(vj.buttons[1], true);
    out.applyFrame({ ...emptyFrame(), buttons: 0 });
    assert.equal(vj.buttons[1], false);
  });

  it('camera mouse mode accumulates fractional deltas', () => {
    const { cfg, inp, out } = makeOutput();
    cfg.mouseScale = 0.5;
    out.applyFrame({ ...emptyFrame(), camDX: 1 });
    out.applyFrame({ ...emptyFrame(), camDX: 1 });
    assert.deepEqual(inp.mouse, [[1, 0]]);
  });
});

describe('gear selector', () => {
  it('closed loop: N -> D -> R using telemetry', async () => {
    const { vj, out } = makeOutput();
    const tel = { gear: 0 } as TelemetryData;
    const g = new GearSelector(out, () => tel);
    // emulate the game reacting to shift buttons (vJoy 13 = shiftUp, 14 = shiftDown)
    const orig = vj.setButton.bind(vj);
    vj.setButton = (b, d) => {
      orig(b, d);
      if (d && b === 13) tel.gear = Math.min(1, Math.sign(tel.gear) + 1);
      if (d && b === 14) tel.gear = Math.max(-1, Math.sign(tel.gear) - 1);
    };
    g.request('D');
    await sleep(500);
    assert.equal(tel.gear, 1);
    g.request('R');
    await sleep(1200);
    assert.equal(tel.gear, -1);
  });
});

describe('server end-to-end', () => {
  it('discovery, hello, frames, telemetry push and disconnect failsafe', async () => {
    const { cfg, vj, out } = makeOutput();
    cfg.port = 18765 + (process.pid % 1000);
    cfg.listenHost = '127.0.0.1';
    cfg.failsafeTimeoutMs = 300;
    const telemetry = new TelemetryReader(1000, 'Local\\NoSuchMapping');
    const gear = new GearSelector(out, () => null);
    const server = new CompanionServer({
      cfg,
      out,
      gear,
      telemetry,
      adb: null,
      status: () => ({ vjoy: { ok: true, message: '' }, keyboard: { ok: true, message: '' }, telemetry: { ok: false, message: '' }, cameraMode: 'mouse' }),
      log: () => {},
    });
    await server.listen();
    try {
      const disc = (await (await fetch(`http://127.0.0.1:${cfg.port}${DISCOVERY_PATH}`)).json()) as { service: string };
      assert.equal(disc.service, SERVICE_ID);

      const ws = new WebSocket(`ws://127.0.0.1:${cfg.port}${WS_PATH}`);
      const msgs: ServerMessage[] = [];
      ws.on('message', (d, bin) => !bin && msgs.push(JSON.parse(d.toString())));
      await new Promise((r) => ws.once('open', r));
      ws.send(JSON.stringify({ t: 'hello', v: 1, device: 'test', link: 'usb' }));
      ws.send(encodeFrame({ ...emptyFrame(), steer: -1, throttle: 1, buttons: actionBit('pass') }));
      await sleep(100);
      assert.equal(msgs[0]?.t, 'welcome');
      assert.ok(msgs.some((m) => m.t === 'tel' && m.d === null), 'telemetry unavailable is reported, not faked');
      assert.equal(vj.axes.X, 0);
      assert.equal(vj.axes.Y, 1);
      assert.equal(vj.buttons[2], true);

      // stop streaming -> failsafe
      await sleep(500);
      assert.equal(vj.axes.Y, 0, 'failsafe reset throttle');
      assert.equal(vj.buttons[2], false, 'failsafe released PASS');

      // resume, then hard disconnect
      ws.send(encodeFrame({ ...emptyFrame(), brake: 1 }));
      await sleep(50);
      assert.equal(vj.axes.Z, 1);
      ws.terminate();
      await sleep(100);
      assert.equal(vj.axes.Z, 0, 'disconnect reset brake');
    } finally {
      server.close();
    }
  });
});
