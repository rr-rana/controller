/**
 * Wi-Fi auto-discovery without native UDP/mDNS modules: probes the phone's /24 subnet
 * for the companion's HTTP discovery endpoint (GET /discover) and returns the first match.
 */
import * as Network from 'expo-network';
import { DISCOVERY_PATH, SERVICE_ID, type DiscoveryResponse } from '../../shared/protocol';

const BATCH = 48;
const TIMEOUT_MS = 800;

export type DiscoveryResult = { host: string; name: string };

async function probe(host: string, port: number, outer: AbortSignal): Promise<DiscoveryResult | null> {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  outer.addEventListener('abort', abort);
  const timer = setTimeout(abort, TIMEOUT_MS);
  try {
    const res = await fetch(`http://${host}:${port}${DISCOVERY_PATH}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as DiscoveryResponse;
    return body.service === SERVICE_ID ? { host, name: body.name } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    outer.removeEventListener('abort', abort);
  }
}

/** Throws with a user-facing message if the phone is not on a LAN. Resolves null if nothing found. */
export async function discoverCompanion(port: number, signal: AbortSignal): Promise<DiscoveryResult | null> {
  const ip = await Network.getIpAddressAsync();
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip ?? '');
  if (!m || ip === '0.0.0.0') throw new Error('No Wi-Fi IP address. Connect the phone to the same Wi-Fi as the PC.');
  const prefix = `${m[1]}.${m[2]}.${m[3]}.`;
  const own = Number(m[4]);
  // Probe addresses closest to our own first (DHCP tends to cluster), skip ourselves.
  const hosts = Array.from({ length: 254 }, (_, i) => i + 1)
    .filter((n) => n !== own)
    .sort((a, b) => Math.abs(a - own) - Math.abs(b - own))
    .map((n) => prefix + n);

  const found = new AbortController();
  const onOuter = () => found.abort();
  signal.addEventListener('abort', onOuter);
  try {
    for (let i = 0; i < hosts.length && !found.signal.aborted; i += BATCH) {
      const batch = hosts.slice(i, i + BATCH);
      let winner: DiscoveryResult | null = null;
      await Promise.all(
        batch.map(async (h) => {
          const r = await probe(h, port, found.signal);
          if (r && !winner) {
            winner = r;
            found.abort(); // cancel the rest
          }
        }),
      );
      if (winner) return winner;
    }
    return null;
  } finally {
    signal.removeEventListener('abort', onOuter);
  }
}
