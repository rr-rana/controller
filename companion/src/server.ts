import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import {
  ACTIONS,
  DISCOVERY_PATH,
  PROTOCOL_VERSION,
  SERVER_HEARTBEAT_MS,
  SERVICE_ID,
  UI_WS_PATH,
  WS_PATH,
  decodeFrame,
  defaultBindings,
  sanitizeBindings,
  type ActionId,
  type ClientMessage,
  type CompanionStatus,
  type DiscoveryResponse,
  type ServerMessage,
  type TelemetryData,
} from '../../shared/protocol.js';
import type { AdbReverse } from './adb.js';
import { COMPANION_ROOT, saveConfig, type CompanionConfig } from './config.js';
import type { GearSelector } from './gear.js';
import type { OutputController } from './output.js';
import type { TelemetryReader } from './telemetry.js';

type PhoneSession = {
  ws: WebSocket;
  device: string;
  link: 'usb' | 'wifi' | '?';
  remote: string;
  connectedAt: number;
  lastFrameAt: number;
  frames: number;
  fps: number;
  failsafeActive: boolean;
};

export type ServerDeps = {
  cfg: CompanionConfig;
  out: OutputController;
  gear: GearSelector;
  telemetry: TelemetryReader;
  adb: AdbReverse | null;
  status: () => CompanionStatus;
  log: (m: string) => void;
};

/** Rounds telemetry so tiny float jitter does not cause network traffic. */
export function quantizeTelemetry(d: TelemetryData): TelemetryData {
  const r = (v: number, step: number) => Math.round(v / step) * step;
  return {
    ...d,
    speedKmh: r(d.speedKmh, 0.1),
    rpm: r(d.rpm, 10),
    rpmMax: Math.round(d.rpmMax),
    fuel: r(d.fuel, 0.1),
    fuelCapacity: Math.round(d.fuelCapacity),
    cruiseSpeedKmh: Math.round(d.cruiseSpeedKmh),
  };
}

export class CompanionServer {
  private http: http.Server;
  private phoneWss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 64 * 1024 });
  private uiWss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 64 * 1024 });
  private phone: PhoneSession | null = null;
  private lastTelJson = '';
  private timers: NodeJS.Timeout[] = [];
  private recentEvents: string[] = [];

  constructor(private d: ServerDeps) {
    this.http = http.createServer((req, res) => this.onHttp(req, res));
    this.http.on('upgrade', (req, socket, head) => {
      const url = (req.url ?? '').split('?')[0];
      if (url === WS_PATH) {
        this.phoneWss.handleUpgrade(req, socket, head, (ws) => this.onPhone(ws, req));
      } else if (url === UI_WS_PATH && isLoopback(req.socket.remoteAddress)) {
        this.uiWss.handleUpgrade(req, socket, head, (ws) => this.onUi(ws));
      } else {
        socket.destroy();
      }
    });
    d.telemetry.on('update', () => this.pushTelemetry());
  }

  listen(): Promise<void> {
    const { port, listenHost } = this.d.cfg;
    return new Promise<void>((resolve, reject) => {
      this.http.once('error', reject);
      this.http.listen(port, listenHost, () => {
        this.http.off('error', reject);
        resolve();
      });
    }).then(() => {
      this.timers.push(setInterval(() => this.watchdog(), 100));
      this.timers.push(setInterval(() => this.send({ t: 'hb' }), SERVER_HEARTBEAT_MS));
      this.timers.push(setInterval(() => this.pushUi(), 100));
    });
  }

  close(): void {
    this.timers.forEach(clearInterval);
    this.phone?.ws.close(1001, 'Companion shutting down');
    this.uiWss.clients.forEach((c) => c.close());
    this.http.close();
  }

  broadcastStatus(): void {
    this.send({ t: 'status', status: this.d.status() });
  }

  private event(msg: string) {
    this.d.log(msg);
    this.recentEvents.push(`${new Date().toLocaleTimeString()}  ${msg}`);
    if (this.recentEvents.length > 40) this.recentEvents.shift();
  }

  // -------------------------------------------------------------- HTTP

  private onHttp(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = (req.url ?? '/').split('?')[0];
    if (url === DISCOVERY_PATH) {
      const body: DiscoveryResponse = { service: SERVICE_ID, v: PROTOCOL_VERSION, name: os.hostname(), port: this.d.cfg.port };
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
      return;
    }
    if ((url === '/' || url === '/index.html') && isLoopback(req.socket.remoteAddress)) {
      fs.readFile(path.join(COMPANION_ROOT, 'ui', 'index.html'), (err, data) => {
        if (err) {
          res.writeHead(500).end('Dashboard file missing');
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(data);
      });
      return;
    }
    res.writeHead(404).end();
  }

  // -------------------------------------------------------------- phone

  private onPhone(ws: WebSocket, req: http.IncomingMessage) {
    if (this.phone) {
      this.sendTo(this.phone.ws, { t: 'kick', why: 'Another phone connected' });
      this.phone.ws.close(4000, 'Replaced by another connection');
      this.dropPhone(this.phone, 'replaced');
    }
    const remote = req.socket.remoteAddress ?? '?';
    const s: PhoneSession = {
      ws,
      device: 'Android',
      link: isLoopback(remote) ? 'usb' : 'wifi',
      remote,
      connectedAt: Date.now(),
      lastFrameAt: Date.now(),
      frames: 0,
      fps: 0,
      failsafeActive: false,
    };
    this.phone = s;
    this.event(`Phone connected from ${remote} (${s.link.toUpperCase()})`);
    this.lastTelJson = '';
    this.sendTo(ws, {
      t: 'welcome',
      v: PROTOCOL_VERSION,
      name: os.hostname(),
      status: this.d.status(),
      bindings: this.d.cfg.bindings,
    });
    this.pushTelemetry(true);

    ws.on('message', (data, isBinary) => this.onPhoneMessage(s, data, isBinary));
    ws.on('close', () => this.dropPhone(s, 'disconnected'));
    ws.on('error', (e) => this.event(`Phone socket error: ${e.message}`));
  }

  private dropPhone(s: PhoneSession, why: string) {
    if (this.phone !== s) return;
    this.phone = null;
    this.d.gear.cancel();
    this.d.out.neutralize();
    this.event(`Phone ${why}: all inputs released`);
  }

  private onPhoneMessage(s: PhoneSession, data: RawData, isBinary: boolean) {
    if (this.phone !== s) return;
    if (isBinary) {
      const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as Buffer);
      const frame = decodeFrame(new DataView(buf.buffer, buf.byteOffset, buf.byteLength));
      if (!frame) return;
      s.lastFrameAt = Date.now();
      s.frames++;
      if (s.failsafeActive) {
        s.failsafeActive = false;
        this.event('Input stream resumed');
      }
      this.d.out.applyFrame(frame);
      return;
    }
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    switch (msg.t) {
      case 'hello':
        s.device = String(msg.device).slice(0, 60);
        if (msg.link === 'usb' || msg.link === 'wifi') s.link = msg.link;
        this.event(`Phone: ${s.device} via ${s.link.toUpperCase()}`);
        break;
      case 'ping':
        this.sendTo(s.ws, { t: 'pong', ts: msg.ts });
        break;
      case 'gear':
        if (msg.g === 'R' || msg.g === 'N' || msg.g === 'D') {
          this.event(`Gear request ${msg.g}`);
          this.d.gear.request(msg.g);
        }
        break;
      case 'pulse':
        if (ACTIONS.includes(msg.action)) {
          this.event(`Test pulse: ${msg.action}`);
          void this.d.out.pulse(msg.action, 250);
        }
        break;
      case 'getBindings':
        this.sendTo(s.ws, { t: 'bindings', map: this.d.cfg.bindings });
        break;
      case 'setBindings':
        this.applyBindings(sanitizeBindings(msg.map));
        break;
      case 'resetBindings':
        this.applyBindings(defaultBindings());
        break;
    }
  }

  private applyBindings(map: CompanionConfig['bindings']) {
    this.d.out.setBindings(map);
    saveConfig(this.d.cfg);
    this.send({ t: 'bindings', map });
    this.event('Bindings updated');
  }

  /** Failsafe: if the phone stops streaming (frozen app, Wi-Fi drop) release everything. */
  private watchdog() {
    const s = this.phone;
    if (!s) return;
    const now = Date.now();
    if (!s.failsafeActive && now - s.lastFrameAt > this.d.cfg.failsafeTimeoutMs) {
      s.failsafeActive = true;
      this.d.gear.cancel();
      this.d.out.neutralize();
      this.event(`No input for ${this.d.cfg.failsafeTimeoutMs} ms: failsafe released all inputs`);
    }
  }

  private pushTelemetry(force = false) {
    if (!this.phone) return;
    const st = this.d.telemetry.state;
    const msg: ServerMessage = st.ok ? { t: 'tel', d: quantizeTelemetry(st.data) } : { t: 'tel', d: null, why: st.why };
    const json = JSON.stringify(msg);
    if (!force && json === this.lastTelJson) return;
    this.lastTelJson = json;
    if (this.phone.ws.readyState === WebSocket.OPEN) this.phone.ws.send(json);
  }

  private send(msg: ServerMessage) {
    if (this.phone) this.sendTo(this.phone.ws, msg);
  }

  private sendTo(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  // -------------------------------------------------------------- dashboard

  private lastFpsCount = 0;
  private lastFpsAt = Date.now();
  private fpsSession: PhoneSession | null = null;

  private onUi(ws: WebSocket) {
    ws.on('message', (data) => {
      let msg: { t: string; [k: string]: unknown };
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.t === 'setBindings') this.applyBindings(sanitizeBindings(msg.map));
      else if (msg.t === 'resetBindings') this.applyBindings(defaultBindings());
      else if (msg.t === 'pulse' && ACTIONS.includes(msg.action as ActionId)) {
        const delay = Math.min(10000, Math.max(0, Number(msg.delayMs) || 0));
        this.event(`Dashboard test: ${msg.action as string} in ${delay} ms`);
        setTimeout(() => void this.d.out.pulse(msg.action as ActionId, 250), delay);
      } else if (msg.t === 'setCameraMode' && (msg.mode === 'mouse' || msg.mode === 'axis')) {
        this.d.cfg.cameraMode = msg.mode;
        this.d.out.setCameraMode();
        saveConfig(this.d.cfg);
        this.broadcastStatus();
        this.event(`Camera mode: ${msg.mode}`);
      } else if (msg.t === 'gear' && (msg.g === 'R' || msg.g === 'N' || msg.g === 'D')) {
        this.d.gear.request(msg.g);
      }
    });
  }

  private pushUi() {
    if (this.uiWss.clients.size === 0) return;
    const now = Date.now();
    const s = this.phone;
    if (s !== this.fpsSession) {
      // new or no session: restart the rate window
      this.fpsSession = s;
      this.lastFpsCount = s?.frames ?? 0;
      this.lastFpsAt = now;
    } else if (s && now - this.lastFpsAt >= 1000) {
      s.fps = Math.round(((s.frames - this.lastFpsCount) * 1000) / (now - this.lastFpsAt));
      this.lastFpsCount = s.frames;
      this.lastFpsAt = now;
    }
    const tel = this.d.telemetry.state;
    const snapshot = {
      t: 'snapshot',
      port: this.d.cfg.port,
      host: os.hostname(),
      addresses: lanAddresses(),
      status: this.d.status(),
      phone: s
        ? {
            device: s.device,
            link: s.link,
            remote: s.remote,
            since: s.connectedAt,
            frameAgeMs: now - s.lastFrameAt,
            fps: s.fps,
            failsafe: s.failsafeActive,
          }
        : null,
      frame: this.d.out.lastFrame,
      held: ACTIONS.filter((a) => this.d.out.isActionDown(a)),
      telemetry: tel.ok ? { ok: true, gameVersion: tel.gameVersion, data: quantizeTelemetry(tel.data) } : tel,
      adb: this.d.adb?.status ?? null,
      bindings: this.d.cfg.bindings,
      events: this.recentEvents,
    };
    const json = JSON.stringify(snapshot);
    this.uiWss.clients.forEach((c) => c.readyState === WebSocket.OPEN && c.send(json));
  }
}

function isLoopback(addr: string | undefined): boolean {
  return !!addr && (addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1');
}

export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}
