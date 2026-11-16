import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { connection, linkStore, telemetryStore } from '@/lib/connection';
import { useStore } from '@/lib/store';
import { C } from '@/lib/theme';
import { FuelIcon, GearIcon, MenuIcon, TruckIcon, UsbIcon, WifiIcon } from './icons';

const SEGMENTS = 8;

function RpmGauge({ width, compact }: { width: number; compact: boolean }) {
  const rpm = useStore(telemetryStore, (t) => (t.data ? t.data.rpm : null));
  const max = useStore(telemetryStore, (t) => (t.data && t.data.rpmMax > 0 ? t.data.rpmMax : 2500));
  const lit = rpm === null ? 0 : Math.round((rpm / max) * SEGMENTS);
  const segW = (width - (SEGMENTS - 1) * 3) / SEGMENTS;
  return (
    <View style={styles.group}>
      <Text style={styles.label}>RPM</Text>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <View
            key={i}
            style={[
              styles.seg,
              { width: segW },
              i < lit && { backgroundColor: i >= SEGMENTS - 1 ? C.bad : C.gold },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.value, { minWidth: compact ? 38 : 78 }]}>
        {rpm === null ? '--' : Math.round(rpm).toLocaleString('en-US')}
        {compact ? '' : ' RPM'}
      </Text>
    </View>
  );
}

function FuelGauge({ width }: { width: number }) {
  const pct = useStore(telemetryStore, (t) =>
    t.data && t.data.fuelCapacity > 0 ? Math.round((t.data.fuel / t.data.fuelCapacity) * 100) : null,
  );
  return (
    <View style={styles.group}>
      <FuelIcon size={20} color={pct !== null && pct < 15 ? C.bad : '#cfd2d6'} />
      <View style={[styles.fuelTrack, { width }]}>
        {pct !== null && (
          <View style={[styles.fuelFill, { width: `${Math.min(100, pct)}%` }, pct < 15 && { backgroundColor: C.bad }]} />
        )}
      </View>
      <Text style={[styles.value, { minWidth: 36 }]}>{pct === null ? '--%' : `${pct}%`}</Text>
    </View>
  );
}

function statusText(status: string, telemetryOk: boolean, mode: string) {
  switch (status) {
    case 'connected':
      return { text: telemetryOk ? 'Connected' : 'Connected · no telemetry', color: telemetryOk ? C.ok : C.warn };
    case 'connecting':
      return { text: 'Connecting…', color: C.warn };
    case 'discovering':
      return { text: 'Searching Wi-Fi…', color: C.warn };
    case 'waiting':
      return { text: mode === 'usb' ? 'Waiting for USB…' : 'Waiting for PC…', color: C.bad };
    default:
      return { text: 'Offline', color: C.bad };
  }
}

export function TopBar({ height, width, onMenu }: { height: number; width: number; onMenu: () => void }) {
  const status = useStore(linkStore, (s) => s.status);
  const mode = useStore(linkStore, (s) => s.mode);
  const host = useStore(linkStore, (s) => s.host);
  const telemetryOk = useStore(telemetryStore, (t) => t.data !== null);
  const st = statusText(status, telemetryOk, mode);
  const btn = height * 0.78;
  const compact = width < 760;
  const tiny = width < 680;
  const connected = status === 'connected';

  return (
    <View style={[styles.bar, { height, gap: compact ? 7 : 10 }]}>
      <Pressable onPress={onMenu} style={[styles.iconBtn, { width: btn, height: btn }]} hitSlop={6} accessibilityLabel="Connection">
        <MenuIcon />
      </Pressable>
      <TruckIcon size={height * (compact ? 0.5 : 0.6)} />
      <View style={{ marginLeft: 2, flexShrink: 1 }}>
        {!tiny && (
          <Text style={styles.title} numberOfLines={1}>
            ETS2 Controller
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={[styles.dot, { backgroundColor: st.color }]} />
          <Text style={[styles.status, { color: st.color }]} numberOfLines={1}>
            {st.text}
          </Text>
        </View>
      </View>
      <View style={styles.divider} />
      <RpmGauge width={tiny ? 64 : compact ? 84 : 130} compact={compact} />
      <View style={styles.divider} />
      <FuelGauge width={tiny ? 44 : compact ? 64 : 120} />
      <View style={{ flex: 1 }} />
      <Pressable
        onPress={() => connection.restart()}
        style={[styles.chip, { height: btn, paddingHorizontal: compact ? 9 : 12 }]}
        accessibilityLabel="Reconnect">
        {mode === 'usb' ? (
          <UsbIcon size={18} color={connected ? C.ok : C.bad} />
        ) : (
          <WifiIcon size={18} color={connected ? C.ok : C.bad} />
        )}
        <Text style={styles.chipText} numberOfLines={1}>
          {mode === 'usb' ? 'USB' : (host ?? 'Wi-Fi')}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => router.push('/settings')}
        style={[styles.iconBtn, { width: btn, height: btn }]}
        hitSlop={6}
        accessibilityLabel="Settings">
        <GearIcon />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  iconBtn: {
    backgroundColor: C.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: C.text, fontSize: 15, fontWeight: '700' },
  status: { fontSize: 11, fontWeight: '500' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  divider: { width: 1, alignSelf: 'stretch', marginVertical: 10, backgroundColor: C.line },
  group: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { color: C.dim, fontSize: 11, fontWeight: '600' },
  seg: { height: 11, backgroundColor: '#3a3e45', transform: [{ skewX: '-18deg' }], borderRadius: 1 },
  value: { color: C.text, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  fuelTrack: { height: 9, borderRadius: 5, backgroundColor: '#2c3037', overflow: 'hidden' },
  fuelFill: { height: '100%', backgroundColor: C.gold, borderRadius: 5 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    maxWidth: 180,
  },
  chipText: { color: C.text, fontSize: 13, fontWeight: '600' },
});
