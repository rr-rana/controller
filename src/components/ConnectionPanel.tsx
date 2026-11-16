import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { connection, linkStore, telemetryStore } from '@/lib/connection';
import { settingsStore, updateSettings, type ConnectionMode } from '@/lib/settings';
import { useStore } from '@/lib/store';
import { C } from '@/lib/theme';

function Row({ label, ok, text }: { label: string; ok: boolean | null; text: string }) {
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: ok === null ? C.faint : ok ? C.ok : C.bad }]} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

/** Quick connection overlay opened from the top-left menu button. */
export function ConnectionPanel({ onClose }: { onClose: () => void }) {
  const link = useStore(linkStore, (s) => s);
  const tel = useStore(telemetryStore, (s) => s);
  const mode = useStore(settingsStore, (s) => s.connectionMode);

  const setMode = (m: ConnectionMode) => {
    if (m === mode) return;
    updateSettings({ connectionMode: m });
    connection.restart();
  };

  const comp = link.companion;
  return (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable style={styles.panel} onPress={() => {}}>
        <ScrollView contentContainerStyle={{ gap: 10 }}>
          <Text style={styles.title}>Connection</Text>
          <View style={styles.segment}>
            {(['usb', 'wifi'] as const).map((m) => (
              <Pressable key={m} onPress={() => setMode(m)} style={[styles.segItem, mode === m && styles.segOn]}>
                <Text style={[styles.segText, mode === m && styles.segTextOn]}>{m === 'usb' ? 'USB (ADB)' : 'Wi-Fi'}</Text>
              </Pressable>
            ))}
          </View>
          <Row
            label="Link"
            ok={link.status === 'connected'}
            text={
              link.status === 'connected'
                ? `${link.serverName ?? 'PC'} · ${link.host}${link.rttMs !== null ? ` · ${link.rttMs} ms` : ''}`
                : link.message || link.status
            }
          />
          <Row label="vJoy" ok={comp ? comp.vjoy.ok : null} text={comp?.vjoy.message ?? '—'} />
          <Row label="Keyboard" ok={comp ? comp.keyboard.ok : null} text={comp?.keyboard.message ?? '—'} />
          <Row label="Telemetry" ok={comp ? tel.data !== null : null} text={tel.data ? `${tel.data.game.toUpperCase()} live` : tel.why} />
          <Row label="Camera" ok={null} text={comp ? (comp.cameraMode === 'mouse' ? 'Mouse free-look' : 'vJoy RX/RY axes') : '—'} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <Pressable style={styles.btn} onPress={() => connection.restart()}>
              <Text style={styles.btnText}>Reconnect</Text>
            </Pressable>
            {mode === 'wifi' && (
              <Pressable style={styles.btn} onPress={() => connection.rediscover()}>
                <Text style={styles.btnText}>Search Wi-Fi again</Text>
              </Pressable>
            )}
            <View style={{ flex: 1 }} />
            <Pressable style={[styles.btn, styles.btnGold]} onPress={onClose}>
              <Text style={[styles.btnText, { color: '#111' }]}>Done</Text>
            </Pressable>
          </View>
          {mode === 'usb' && (
            <Text style={styles.hint}>
              USB: enable Developer options → USB debugging, plug the phone into the PC and start the companion. It runs
              “adb reverse” automatically.
            </Text>
          )}
          {mode === 'wifi' && (
            <Text style={styles.hint}>
              Wi-Fi: phone and PC on the same network. The app scans for the companion; set a fixed IP in Settings if
              scanning fails.
            </Text>
          )}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  panel: { width: '70%', maxWidth: 620, maxHeight: '88%', backgroundColor: C.panel, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 16 },
  title: { color: C.text, fontSize: 16, fontWeight: '700' },
  segment: { flexDirection: 'row', backgroundColor: '#0e1013', borderRadius: 10, padding: 3, borderWidth: 1, borderColor: C.line },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segOn: { backgroundColor: C.gold },
  segText: { color: C.dim, fontWeight: '600' },
  segTextOn: { color: '#111' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowLabel: { color: C.dim, width: 78, fontSize: 13 },
  rowText: { color: C.text, flex: 1, fontSize: 13 },
  btn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: C.panelHi, borderWidth: 1, borderColor: C.line },
  btnGold: { backgroundColor: C.gold, borderColor: C.gold },
  btnText: { color: C.text, fontWeight: '600' },
  hint: { color: C.dim, fontSize: 12 },
});
