import { StyleSheet, Text, View } from 'react-native';
import type { GearTarget } from '../../shared/protocol';
import { connection, linkStore, telemetryStore } from '@/lib/connection';
import { useStore } from '@/lib/store';
import { C } from '@/lib/theme';
import { PressButton } from './PressButton';

const GEARS: GearTarget[] = ['R', 'N', 'D'];

/** R/N/D selector. Highlight follows the real gear from telemetry when available. */
export function GearSelector({ width, height }: { width: number; height: number }) {
  const telGear = useStore(telemetryStore, (t) => (t.data ? Math.sign(t.data.gear) : null));
  const requested = useStore(linkStore, (s) => s.requestedGear);
  const current: GearTarget | null =
    telGear === null ? requested : telGear < 0 ? 'R' : telGear > 0 ? 'D' : 'N';
  const pad = 4;
  const itemW = (width - pad * 2) / 3;
  const itemH = height - pad * 2;

  return (
    <View style={[styles.pill, { width, height, borderRadius: height / 2, padding: pad }]}>
      {GEARS.map((g) => {
        const on = current === g;
        return (
          <PressButton
            key={g}
            width={itemW}
            height={itemH}
            radius={itemH / 2}
            onPress={() => connection.requestGear(g)}
            style={[styles.item, on && styles.itemOn]}>
            {() => <Text style={[styles.text, { fontSize: itemH * 0.5 }, on && styles.textOn]}>{g}</Text>}
          </PressButton>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', backgroundColor: '#0e1013', borderWidth: 1, borderColor: C.line },
  item: { backgroundColor: 'transparent', borderWidth: 0, elevation: 0, shadowOpacity: 0 },
  itemOn: { backgroundColor: C.gold },
  text: { color: '#d7d9dc', fontWeight: '700' },
  textOn: { color: '#141414' },
});
