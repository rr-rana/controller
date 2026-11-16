import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { GestureDetector, ScrollView, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BindingEditor } from '@/components/BindingEditor';
import { pedalResponse } from '@/components/Pedal';
import { Button, Card, Segmented, SliderRow, ToggleRow, ui } from '@/components/settings-ui';
import { connection, linkStore } from '@/lib/connection';
import { resetSettings, settingsStore, updateSettings, type Settings } from '@/lib/settings';
import { useStore } from '@/lib/store';
import { C, clamp } from '@/lib/theme';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const x100 = (v: number) => `${v.toFixed(2)}×`;

/** Local calibration preview: shows raw finger travel vs resulting output. Not sent to the game. */
function PedalTest({ s }: { s: Settings }) {
  const [travel, setTravel] = useState<number | null>(null);
  const H = 120;
  const pan = usePanGesture({
    minDistance: 0,
    runOnJS: true,
    onBegin: (e) => setTravel(1 - clamp(e.y / H, 0, 1)),
    onUpdate: (e) => setTravel(1 - clamp(e.y / H, 0, 1)),
    onFinalize: () => setTravel(null),
  });
  const t = travel ?? 0;
  const thr = pedalResponse(t, s.throttleMin, s.throttleMax, s.pedalCurve);
  const brk = pedalResponse(t, s.brakeMin, s.brakeMax, s.pedalCurve);
  const bar = (label: string, v: number) => (
    <View style={{ flex: 1 }}>
      <Text style={ui.hint}>
        {label} {pct(v)}
      </Text>
      <View style={styles.testTrack}>
        <View style={[styles.testFill, { width: `${v * 100}%` }]} />
      </View>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
      <GestureDetector gesture={pan}>
        <View style={[styles.testPad, { height: H }]} collapsable={false}>
          <View style={[styles.testPadFill, { height: `${t * 100}%` }]} />
          <Text style={styles.testPadText}>{travel === null ? 'press\n& slide' : pct(t)}</Text>
        </View>
      </GestureDetector>
      <View style={{ flex: 1, gap: 10 }}>
        {bar('Throttle output', thr)}
        {bar('Brake output', brk)}
        <Text style={ui.hint}>Preview only (not sent to the game).</Text>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const s = useStore(settingsStore, (x) => x);
  const status = useStore(linkStore, (x) => x.status);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [host, setHost] = useState(s.wifiHost);
  const [port, setPort] = useState(String(s.port));
  const twoCol = width >= 640;

  const applyConnection = () => {
    const p = parseInt(port, 10);
    updateSettings({ wifiHost: host.trim(), port: p >= 1024 && p <= 65535 ? p : s.port });
    connection.restart();
  };

  const connectionCard = (
    <Card title="Connection" right={<Text style={[ui.hint, { marginTop: 0 }]}>{status}</Text>}>
      <Segmented
        value={s.connectionMode}
        onChange={(m) => {
          updateSettings({ connectionMode: m });
          connection.restart();
        }}
        options={[
          { value: 'usb', label: 'USB (ADB reverse)' },
          { value: 'wifi', label: 'Wi-Fi' },
        ]}
      />
      {s.connectionMode === 'wifi' && (
        <View style={{ gap: 8 }}>
          <Text style={ui.label}>PC IP address</Text>
          <TextInput
            style={ui.input}
            value={host}
            onChangeText={setHost}
            placeholder={s.lastFoundHost ? `auto (last found ${s.lastFoundHost})` : 'auto-discover (leave empty)'}
            placeholderTextColor={C.faint}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
          />
          <Text style={ui.hint}>Leave empty to find the companion automatically. The PC address is shown in the companion window.</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Text style={ui.label}>Port</Text>
        <TextInput
          style={[ui.input, { width: 90 }]}
          value={port}
          onChangeText={setPort}
          keyboardType="number-pad"
          placeholderTextColor={C.faint}
        />
        <View style={{ flex: 1 }} />
        {s.connectionMode === 'wifi' && <Button small title="Search again" onPress={() => connection.rediscover()} />}
        <Button small gold title="Connect" onPress={applyConnection} />
      </View>
    </Card>
  );

  const steeringCard = (
    <Card title="Steering">
      <SliderRow
        label="Rotation range"
        value={s.steeringRange}
        min={180}
        max={900}
        step={30}
        format={(v) => `${v}°`}
        hint="Lock-to-lock wheel rotation on the phone. 900° = 2.5 turns."
        onChange={(v) => updateSettings({ steeringRange: v })}
      />
      <SliderRow
        label="Sensitivity"
        value={s.steeringSensitivity}
        min={0.5}
        max={3}
        step={0.05}
        format={x100}
        hint="Wheel degrees per degree of finger movement."
        onChange={(v) => updateSettings({ steeringSensitivity: v })}
      />
      <SliderRow
        label="Dead zone"
        value={s.steeringDeadzone}
        min={0}
        max={0.2}
        step={0.005}
        format={pct}
        onChange={(v) => updateSettings({ steeringDeadzone: v })}
      />
      <ToggleRow label="Auto-centering" value={s.autoCenter} onChange={(v) => updateSettings({ autoCenter: v })} />
      {s.autoCenter && (
        <SliderRow
          label="Centering speed"
          value={s.autoCenterSpeed}
          min={90}
          max={1440}
          step={30}
          format={(v) => `${v}°/s`}
          onChange={(v) => updateSettings({ autoCenterSpeed: v })}
        />
      )}
    </Card>
  );

  const pedalsCard = (
    <Card title="Pedals">
      <SliderRow
        label="Response curve"
        value={s.pedalCurve}
        min={0.4}
        max={2.5}
        step={0.05}
        format={(v) => (v === 1 ? 'linear' : v < 1 ? `${v.toFixed(2)} (quick)` : `${v.toFixed(2)} (fine)`)}
        hint="Below 1: more output early in the travel. Above 1: finer control at low speed."
        onChange={(v) => updateSettings({ pedalCurve: v })}
      />
      <SliderRow label="Throttle start (dead zone)" value={s.throttleMin} min={0} max={0.4} step={0.01} format={pct} onChange={(v) => updateSettings({ throttleMin: Math.min(v, s.throttleMax - 0.1) })} />
      <SliderRow label="Throttle full at" value={s.throttleMax} min={0.5} max={1} step={0.01} format={pct} onChange={(v) => updateSettings({ throttleMax: Math.max(v, s.throttleMin + 0.1) })} />
      <SliderRow label="Brake start (dead zone)" value={s.brakeMin} min={0} max={0.4} step={0.01} format={pct} onChange={(v) => updateSettings({ brakeMin: Math.min(v, s.brakeMax - 0.1) })} />
      <SliderRow label="Brake full at" value={s.brakeMax} min={0.5} max={1} step={0.01} format={pct} onChange={(v) => updateSettings({ brakeMax: Math.max(v, s.brakeMin + 0.1) })} />
      <PedalTest s={s} />
    </Card>
  );

  const cameraCard = (
    <Card title="Camera look & feedback">
      <SliderRow
        label="Camera sensitivity"
        value={s.cameraSensitivity}
        min={0.2}
        max={4}
        step={0.05}
        format={x100}
        hint="Slide on the empty upper-right area of the dashboard to look around."
        onChange={(v) => updateSettings({ cameraSensitivity: v })}
      />
      <ToggleRow label="Invert vertical look" value={s.cameraInvertY} onChange={(v) => updateSettings({ cameraInvertY: v })} />
      <ToggleRow label="Haptic feedback" value={s.haptics} onChange={(v) => updateSettings({ haptics: v })} />
      <Button
        title="Reset controller settings to defaults"
        onPress={() =>
          Alert.alert('Reset settings?', 'Steering, pedal, camera and feedback settings return to defaults. Connection settings are kept.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reset', style: 'destructive', onPress: resetSettings },
          ])
        }
      />
    </Card>
  );

  return (
    <View style={[styles.root, { paddingLeft: Math.max(insets.left, 14), paddingRight: Math.max(insets.right, 14) }]}>
      <View style={styles.header}>
        <Button small title="‹ Back" onPress={() => router.back()} />
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 70 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 30 + insets.bottom, gap: 12 }} keyboardShouldPersistTaps="handled">
        {twoCol ? (
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 12 }}>
              {connectionCard}
              {steeringCard}
              {cameraCard}
            </View>
            <View style={{ flex: 1, gap: 12 }}>
              {pedalsCard}
            </View>
          </View>
        ) : (
          <>
            {connectionCard}
            {steeringCard}
            {pedalsCard}
            {cameraCard}
          </>
        )}
        <BindingEditor />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  title: { color: C.text, fontSize: 18, fontWeight: '700' },
  testPad: {
    width: 70,
    borderRadius: 10,
    backgroundColor: '#0e1013',
    borderWidth: 1,
    borderColor: C.lineHi,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  testPadFill: { backgroundColor: 'rgba(242,184,30,0.35)' },
  testPadText: { position: 'absolute', alignSelf: 'center', top: '40%', color: C.dim, fontSize: 11, textAlign: 'center' },
  testTrack: { height: 8, borderRadius: 4, backgroundColor: '#2c3037', overflow: 'hidden', marginTop: 3 },
  testFill: { height: '100%', backgroundColor: C.gold },
});
