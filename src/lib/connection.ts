/**
 * Phone <-> companion link. Same logic for USB (adb reverse -> 127.0.0.1) and Wi-Fi (LAN IP).
 *
 *  - Input frames are sent immediately on change (throttled to ~125 Hz) plus a heartbeat.
 *  - Server silence or socket errors trigger reconnect with backoff.
 *  - Going to background / disconnecting releases every input locally and on the PC
 *    (the companion also has its own failsafe timeout).
 */
import * as Device from 'expo-device';
import { AppState } from 'react-native';
import {
  HEARTBEAT_INTERVAL_MS,
  PROTOCOL_VERSION,
  WS_PATH,
  encodeFrame,
  type ActionId,
  type BindingMap,
  type ClientMessage,
  type CompanionStatus,
  type GearTarget,
  type ServerMessage,
  type TelemetryData,
} from '../../shared/protocol';
import { discoverCompanion } from './discovery';
import { input } from './input';
import { settingsStore, updateSettings } from './settings';
import { createStore } from './store';

export type LinkStatus = 'idle' | 'discovering' | 'connecting' | 'connected' | 'waiting';

export type LinkState = {
  status: LinkStatus;
  mode: 'usb' | 'wifi';
  host: string | null;
  serverName: string | null;
  companion: CompanionStatus | null;
  bindings: BindingMap | null;
  rttMs: number | null;
  /** Human-readable reason for the current state (errors, hints). */
  message: string;
  /** Set when the last requested gear is known (fallback when telemetry is unavailable). */
  requestedGear: GearTarget | null;
};

export type TelemetryState = { data: TelemetryData | null; why: string };

export const linkStore = createStore<LinkState>({
  status: 'idle',
  mode: settingsStore.get().connectionMode,
  host: null,
  serverName: null,
  companion: null,
  bindings: null,
  rttMs: null,
  message: '',
  requestedGear: null,
});

export const telemetryStore = createStore<TelemetryState>({ data: null, why: 'Not connected to PC' });

const MIN_SEND_INTERVAL_MS = 8;
const SERVER_SILENCE_MS = 2500;
const CONNECT_TIMEOUT_MS = 4000;

class Connection {
  private ws: WebSocket | null = null;
  private seq = 0;
  private lastSend = 0;
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private pinger: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastServerMsg = 0;
  private attempts = 0;
  private running = false;
  private discovery: AbortController | null = null;
  private generation = 0;

  constructor() {
    input.setListener(() => this.scheduleSend());
    AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        if (this.wantRunning) this.start();
      } else if (this.running) {
        this.stop('App in background');
        this.wantRunning = true;
      }
    });
  }

  private wantRunning = false;

  private patch(p: Partial<LinkState>) {
    linkStore.set((s) => ({ ...s, ...p }));
  }

  start() {
    this.wantRunning = true;
    if (this.running) return;
    this.running = true;
    this.attempts = 0;
    void this.connect();
  }

  /** Stops and releases all inputs. */
  stop(reason = 'Stopped') {
    this.wantRunning = false;
    this.running = false;
    this.discovery?.abort();
    this.discovery = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.closeSocket();
    input.releaseAll();
    this.patch({ status: 'idle', message: reason, rttMs: null });
    telemetryStore.set({ data: null, why: 'Not connected to PC' });
  }

  /** Re-reads settings (mode/host/port) and reconnects. */
  restart() {
    this.stop('Reconnecting…');
    this.start();
  }

  /** Forgets the remembered Wi-Fi host and scans the network. */
  rediscover() {
    updateSettings({ lastFoundHost: '' });
    this.restart();
  }

  // ---------------------------------------------------------------- sending

  sendJson(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  requestGear(g: GearTarget) {
    this.patch({ requestedGear: g });
    this.sendJson({ t: 'gear', g });
  }

  pulse(action: ActionId) {
    this.sendJson({ t: 'pulse', action });
  }

  setBindings(map: BindingMap) {
    this.sendJson({ t: 'setBindings', map });
  }

  resetBindings() {
    this.sendJson({ t: 'resetBindings' });
  }

  private scheduleSend() {
    if (this.ws?.readyState !== WebSocket.OPEN || this.sendTimer) return;
    const wait = MIN_SEND_INTERVAL_MS - (Date.now() - this.lastSend);
    if (wait <= 0) this.sendFrame();
    else this.sendTimer = setTimeout(() => this.sendFrame(), wait);
  }

  private sendFrame() {
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.sendTimer = null;
    const ws = this.ws;
    if (ws?.readyState !== WebSocket.OPEN) return;
    this.seq = (this.seq + 1) & 0xff;
    ws.send(encodeFrame(input.takeFrame(this.seq)));
    this.lastSend = Date.now();
  }

  // ---------------------------------------------------------------- lifecycle

  private async resolveHost(gen: number): Promise<string | null> {
    const s = settingsStore.get();
    if (s.connectionMode === 'usb') return '127.0.0.1';
    if (s.wifiHost.trim()) return s.wifiHost.trim();
    // Retry the last discovered PC a couple of times before rescanning the subnet.
    if (s.lastFoundHost && this.attempts < 3) return s.lastFoundHost;
    this.patch({ status: 'discovering', message: 'Searching for the PC on Wi-Fi…' });
    this.discovery = new AbortController();
    try {
      const found = await discoverCompanion(s.port, this.discovery.signal);
      if (gen !== this.generation) return null;
      if (!found) {
        this.patch({ status: 'waiting', message: 'PC not found. Is the companion running? Enter the IP manually in Settings.' });
        return null;
      }
      updateSettings({ lastFoundHost: found.host });
      return found.host;
    } catch (e) {
      this.patch({ status: 'waiting', message: (e as Error).message });
      return null;
    } finally {
      this.discovery = null;
    }
  }

  private async connect() {
    const gen = ++this.generation;
    const s = settingsStore.get();
    this.patch({ mode: s.connectionMode, companion: null, serverName: null });
    const host = await this.resolveHost(gen);
    if (gen !== this.generation || !this.running) return;
    if (!host) {
      this.scheduleReconnect(5000);
      return;
    }
    this.patch({ status: 'connecting', host, message: `Connecting to ${host}:${s.port}…` });
    const ws = new WebSocket(`ws://${host}:${s.port}${WS_PATH}`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.connectTimer = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) ws.close();
    }, CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      if (this.ws !== ws) return;
      if (this.connectTimer) clearTimeout(this.connectTimer);
      this.attempts = 0;
      this.lastServerMsg = Date.now();
      this.patch({ status: 'connected', message: '' });
      const hello: ClientMessage = {
        t: 'hello',
        v: PROTOCOL_VERSION,
        device: Device.modelName ?? 'Android',
        link: s.connectionMode,
      };
      ws.send(JSON.stringify(hello));
      this.sendFrame();
      this.heartbeat = setInterval(() => {
        if (Date.now() - this.lastServerMsg > SERVER_SILENCE_MS) {
          ws.close();
          return;
        }
        if (Date.now() - this.lastSend >= HEARTBEAT_INTERVAL_MS - 10) this.sendFrame();
      }, HEARTBEAT_INTERVAL_MS / 2);
      this.pinger = setInterval(() => this.sendJson({ t: 'ping', ts: Date.now() }), 2000);
    };

    ws.onmessage = (ev) => {
      if (this.ws !== ws || typeof ev.data !== 'string') return;
      this.lastServerMsg = Date.now();
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.onMessage(msg);
    };

    ws.onerror = () => {
      /* onclose follows */
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.closeSocket();
      input.releaseAll();
      telemetryStore.set({ data: null, why: 'Not connected to PC' });
      if (!this.running) return;
      const hint =
        s.connectionMode === 'usb'
          ? 'USB: start the PC companion, plug in the phone and allow USB debugging.'
          : `Wi-Fi: cannot reach ${host}:${s.port}. Check the companion and firewall.`;
      this.patch({ status: 'waiting', message: hint, rttMs: null, companion: null });
      this.scheduleReconnect();
    };
  }

  private onMessage(msg: ServerMessage) {
    switch (msg.t) {
      case 'welcome':
        this.patch({ serverName: msg.name, companion: msg.status, bindings: msg.bindings });
        break;
      case 'status':
        this.patch({ companion: msg.status });
        break;
      case 'bindings':
        this.patch({ bindings: msg.map });
        break;
      case 'tel':
        telemetryStore.set({ data: msg.d, why: msg.d ? '' : (msg.why ?? 'Telemetry unavailable') });
        break;
      case 'pong':
        this.patch({ rttMs: Date.now() - msg.ts });
        break;
      case 'kick':
        // Another device took over. Don't auto-reconnect, or two phones would replace each other forever.
        this.stop(`${msg.why}. Tap reconnect to take over.`);
        break;
      case 'hb':
        break;
    }
  }

  private scheduleReconnect(delay?: number) {
    if (!this.running || this.reconnectTimer) return;
    this.attempts++;
    const ms = delay ?? Math.min(3000, 400 * this.attempts);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.running) void this.connect();
    }, ms);
  }

  private closeSocket() {
    this.generation++;
    if (this.connectTimer) clearTimeout(this.connectTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.pinger) clearInterval(this.pinger);
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.connectTimer = this.heartbeat = this.pinger = this.sendTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        if (ws.readyState === WebSocket.OPEN) {
          // tell the PC to release everything before closing
          input.releaseAll();
          this.seq = (this.seq + 1) & 0xff;
          ws.send(encodeFrame(input.takeFrame(this.seq)));
        }
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }
}

export const connection = new Connection();
