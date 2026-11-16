import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { ACTIONS, ACTION_LABELS, type Binding, type BindingMap } from '../../shared/protocol';
import { connection, linkStore } from '@/lib/connection';
import { useStore } from '@/lib/store';
import { C } from '@/lib/theme';
import { Button, Card, Segmented, ui } from './settings-ui';

type Draft = Record<string, { type: Binding['type']; value: string }>;

const toDraft = (map: BindingMap): Draft =>
  Object.fromEntries(
    ACTIONS.map((a) => {
      const b = map[a];
      return [a, { type: b.type, value: b.type === 'vjoy' ? String(b.button) : b.type === 'key' ? b.key : '' }];
    }),
  );

const fromDraft = (d: Draft): BindingMap =>
  Object.fromEntries(
    ACTIONS.map((a) => {
      const e = d[a];
      const b: Binding =
        e.type === 'vjoy'
          ? { type: 'vjoy', button: Math.min(128, Math.max(1, parseInt(e.value, 10) || 1)) }
          : e.type === 'key'
            ? { type: 'key', key: e.value.trim() || 'H' }
            : { type: 'none' };
      return [a, b];
    }),
  ) as BindingMap;

/** Edits the companion's action -> vJoy button / keyboard key mapping (stored on the PC). */
export function BindingEditor() {
  const bindings = useStore(linkStore, (s) => s.bindings);
  const connected = useStore(linkStore, (s) => s.status === 'connected');
  const [edited, setEdited] = useState<Draft | null>(null);
  const dirty = edited !== null;
  // Show the companion's mapping until the user starts editing.
  const draft = edited ?? (bindings ? toDraft(bindings) : null);
  const setDirty = (d: boolean) => {
    if (!d) setEdited(null);
  };

  if (!connected || !draft) {
    return (
      <Card title="Button / key mapping">
        <Text style={ui.hint}>Connect to the PC companion to view and edit the mapping (it is stored on the PC).</Text>
      </Card>
    );
  }

  const set = (a: string, patch: Partial<Draft[string]>) => {
    setEdited({ ...draft, [a]: { ...draft[a], ...patch } });
  };

  return (
    <Card
      title="Button / key mapping"
      right={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            small
            title="Defaults"
            onPress={() => {
              setDirty(false);
              connection.resetBindings();
            }}
          />
          <Button
            small
            gold
            title={dirty ? 'Save' : 'Saved'}
            onPress={() => {
              connection.setBindings(fromDraft(draft));
              setDirty(false);
            }}
          />
        </View>
      }>
      <Text style={ui.hint}>
        vJoy: bind each button once in ETS2 (Options → Keys & Buttons). While ETS2 waits for input, tap “Test” here or press the
        control on the dashboard. Key: sends that keyboard key (ETS2 must be the focused window). Examples: H, J, L, [, ], Space,
        F1, Num5.
      </Text>
      {ACTIONS.map((a) => (
        <View key={a} style={styles.row}>
          <Text style={styles.name} numberOfLines={1}>
            {ACTION_LABELS[a]}
          </Text>
          <View style={{ width: 190 }}>
            <Segmented
              small
              value={draft[a].type}
              onChange={(type) =>
                set(a, { type, value: type === 'vjoy' ? String(ACTIONS.indexOf(a) + 1) : type === 'key' ? '' : '' })
              }
              options={[
                { value: 'vjoy', label: 'vJoy' },
                { value: 'key', label: 'Key' },
                { value: 'none', label: 'None' },
              ]}
            />
          </View>
          <TextInput
            style={[ui.input, styles.val, draft[a].type === 'none' && { opacity: 0.3 }]}
            editable={draft[a].type !== 'none'}
            value={draft[a].value}
            onChangeText={(value) => set(a, { value })}
            keyboardType={draft[a].type === 'vjoy' ? 'number-pad' : 'default'}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={draft[a].type === 'vjoy' ? '#' : 'key'}
            placeholderTextColor={C.faint}
          />
          <Button small title="Test" onPress={() => connection.pulse(a)} />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: C.text, flex: 1, fontSize: 13 },
  val: { width: 70, paddingVertical: 5, textAlign: 'center' },
});
