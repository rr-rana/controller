import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useState, type ComponentType } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ActionId, TelemetryData } from '../../shared/protocol';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { GearSelector } from '@/components/GearSelector';
import {
  ArrowIcon,
  BeaconIcon,
  CameraIcon,
  CruiseIcon,
  HazardIcon,
  HeadlightIcon,
  HighBeamIcon,
  HornIcon,
  ParkingIcon,
  WiperIcon,
  type IconProps,
} from '@/components/icons';
import { LookArea } from '@/components/LookArea';
import { Pedal } from '@/components/Pedal';
import { PressButton } from '@/components/PressButton';
import { SceneBackground } from '@/components/SceneBackground';
import { Speedometer } from '@/components/Speedometer';
import { SteeringWheel } from '@/components/SteeringWheel';
import { TopBar } from '@/components/TopBar';
import { connection, telemetryStore } from '@/lib/connection';
import { useStore } from '@/lib/store';
import { C, clamp } from '@/lib/theme';

type DashButtonDef = {
  action: ActionId;
  Icon: ComponentType<IconProps & { dir?: 'left' | 'right' }>;
  dir?: 'left' | 'right';
  /** Lit state from telemetry. */
  active?: (d: TelemetryData) => boolean;
  /** Blink phase from telemetry (icon dims during the off phase). */
  blink?: (d: TelemetryData) => boolean;
  label: string;
};

const ROW1: DashButtonDef[] = [
  { action: 'headlights', Icon: HeadlightIcon, active: (d) => d.lowBeam || d.lightsParking, label: 'Headlights' },
  { action: 'hazard', Icon: HazardIcon, active: (d) => d.hazard, blink: (d) => d.blinkerLeftOn || d.blinkerRightOn, label: 'Hazard lights' },
  { action: 'wipers', Icon: WiperIcon, active: (d) => d.wipers, label: 'Wipers' },
  { action: 'beacon', Icon: BeaconIcon, active: (d) => d.beacon, label: 'Beacon' },
];
const ROW2: DashButtonDef[] = [
  { action: 'camera', Icon: CameraIcon, label: 'Next camera' },
  { action: 'cruiseControl', Icon: CruiseIcon, active: (d) => d.cruiseControl, label: 'Cruise control' },
  { action: 'parkingBrake', Icon: ParkingIcon, active: (d) => d.parkBrake, label: 'Parking brake' },
  { action: 'indicatorLeft', Icon: ArrowIcon, dir: 'left', active: (d) => d.blinkerLeft && !d.hazard, blink: (d) => d.blinkerLeftOn, label: 'Left indicator' },
  { action: 'indicatorRight', Icon: ArrowIcon, dir: 'right', active: (d) => d.blinkerRight && !d.hazard, blink: (d) => d.blinkerRightOn, label: 'Right indicator' },
];

function DashButton({ def, width, height }: { def: DashButtonDef; width: number; height: number }) {
  const active = useStore(telemetryStore, (t) => (t.data && def.active ? def.active(t.data) : false));
  const phaseOn = useStore(telemetryStore, (t) => (t.data && def.blink ? def.blink(t.data) : true));
  const iconSize = Math.min(height * 0.6, width * 0.55);
  return (
    <PressButton action={def.action} active={active} width={width} height={height}>
      {({ pressed }) => (
        <def.Icon
          size={iconSize}
          dir={def.dir}
          color={(active && phaseOn) || pressed ? C.gold : active ? '#7a6220' : '#e4e6e9'}
        />
      )}
    </PressButton>
  );
}

export default function ControllerScreen() {
  useKeepAwake();
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [panel, setPanel] = useState(false);

  useEffect(() => {
    connection.start();
    return () => connection.stop('Controller closed');
  }, []);

  // ---------------------------------------------------------------- responsive layout
  const padL = Math.max(insets.left, 12);
  const padR = Math.max(insets.right, 12);
  const padT = Math.max(insets.top, 6);
  const padB = Math.max(insets.bottom, 8);
  const innerW = W - padL - padR;
  const barH = clamp(H * 0.13, 40, 60);
  const top = padT + barH + 6;
  const areaH = H - top - padB;
  const gap = innerW < 700 ? 6 : 9;

  // Left: steering wheel
  const wheel = Math.min(areaH * 0.94, innerW * 0.29);
  const wheelX = padL + Math.max(0, innerW * 0.15 - wheel / 2);
  const wheelY = top + (areaH - wheel) * 0.6;

  // Middle: speedometer, gear selector, button grid
  const midL = padL + innerW * 0.3;
  const midR = padL + innerW * 0.655;
  const midW = midR - midL;
  const speedo = Math.min(areaH * 0.47, midW * 0.62);
  const speedoCx = midL + midW * 0.4;
  const speedoTop = top + areaH * 0.04;
  const gearW = speedo * 1.2;
  const gearH = clamp(areaH * 0.11, 30, 48);
  const gearTop = speedoTop + speedo * 0.84;
  const btnH = clamp(areaH * 0.13, 34, 64);
  const row1Top = gearTop + gearH + areaH * 0.04;
  const row2Top = row1Top + btnH + gap;
  const row1W = (midW - gap * 3) / 4;
  const row2W = (midW - gap * 4) / 5;

  // Right: PASS / HORN and pedals
  const passL = padL + innerW * 0.565;
  const passTop = top + areaH * 0.2;
  const passH = clamp(areaH * 0.19, 42, 84);
  const passW = (W - padR - passL - gap * 1.5) / 2;
  const s = Math.min(areaH, innerW * 0.4);
  const brakeW = s * 0.34;
  const brakeH = s * 0.38;
  const accW = s * 0.27;
  const accH = s * 0.47;
  const pedalBottom = top + areaH - s * 0.02;
  const accX = W - padR - accW - s * 0.03;
  const brakeX = accX - s * 0.08 - brakeW;
  const pedalsTop = pedalBottom - accH;

  // Invisible look-around zones (never overlap a control)
  const lookUpper = { left: speedoCx, top: padT + barH + 2, width: W - padR - speedoCx, height: passTop - 6 - (padT + barH + 2) };
  const lookLowerTop = passTop + passH + 8;
  const lookLower = {
    left: midR + gap,
    top: lookLowerTop,
    width: brakeX - 14 - (midR + gap),
    height: pedalsTop - 14 - lookLowerTop,
  };

  return (
    <View style={styles.root}>
      <SceneBackground width={W} height={H * 0.62} />

      <LookArea style={[styles.abs, lookUpper]} />
      {lookLower.width > 30 && lookLower.height > 24 && <LookArea style={[styles.abs, lookLower]} />}

      <View style={[styles.abs, { left: padL, right: padR, top: padT }]}>
        <TopBar height={barH} width={innerW} onMenu={() => setPanel(true)} />
      </View>

      <View style={[styles.abs, { left: wheelX, top: wheelY }]}>
        <SteeringWheel size={wheel} />
      </View>

      <View style={[styles.abs, { left: speedoCx - speedo / 2, top: speedoTop }]} pointerEvents="none">
        <Speedometer size={speedo} />
      </View>
      <View style={[styles.abs, { left: speedoCx - gearW / 2, top: gearTop }]}>
        <GearSelector width={gearW} height={gearH} />
      </View>

      <View style={[styles.abs, styles.row, { left: midL, top: row1Top, gap }]}>
        {ROW1.map((d) => (
          <DashButton key={d.action} def={d} width={row1W} height={btnH} />
        ))}
      </View>
      <View style={[styles.abs, styles.row, { left: midL, top: row2Top, gap }]}>
        {ROW2.map((d) => (
          <DashButton key={d.action} def={d} width={row2W} height={btnH} />
        ))}
      </View>

      <View style={[styles.abs, styles.row, { left: passL, top: passTop, gap: gap * 1.5 }]}>
        <PressButton action="pass" accent width={passW} height={passH} radius={14}>
          {({ pressed }) => (
            <>
              <HighBeamIcon size={passH * 0.55} color={C.gold} />
              <Text style={[styles.bigLabel, { fontSize: passH * 0.3 }, pressed && { color: C.gold }]}>PASS</Text>
            </>
          )}
        </PressButton>
        <PressButton action="horn" accent width={passW} height={passH} radius={14}>
          {({ pressed }) => (
            <>
              <HornIcon size={passH * 0.55} />
              <Text style={[styles.bigLabel, { fontSize: passH * 0.3 }, pressed && { color: C.gold }]}>HORN</Text>
            </>
          )}
        </PressButton>
      </View>

      <View style={[styles.abs, { left: brakeX, top: pedalBottom - brakeH }]}>
        <Pedal kind="brake" width={brakeW} height={brakeH} />
      </View>
      <View style={[styles.abs, { left: accX, top: pedalsTop }]}>
        <Pedal kind="throttle" width={accW} height={accH} />
      </View>

      {panel && <ConnectionPanel onClose={() => setPanel(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  abs: { position: 'absolute' },
  row: { flexDirection: 'row' },
  bigLabel: { color: C.text, fontWeight: '700', marginLeft: 12, letterSpacing: 0.5 },
});
