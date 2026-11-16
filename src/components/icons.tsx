import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

export type IconProps = { size?: number; color?: string; strokeWidth?: number };

const base = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none' as const });

export function MenuIcon({ size = 22, color = '#fff', strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Line x1="4" y1="6.5" x2="20" y2="6.5" />
      <Line x1="4" y1="12" x2="20" y2="12" />
      <Line x1="4" y1="17.5" x2="20" y2="17.5" />
    </Svg>
  );
}

export function TruckIcon({ size = 26, color = '#f2b81e', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round">
      <Path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v10.5H3.5V6A1.5 1.5 0 0 1 5 4.5Z" />
      <Path d="M5.5 7h13v4.5h-13Z" />
      <Line x1="3.5" y1="13.5" x2="20.5" y2="13.5" />
      <Rect x="5" y="16.5" width="3" height="3" rx="0.8" />
      <Rect x="16" y="16.5" width="3" height="3" rx="0.8" />
      <Line x1="2" y1="8" x2="3.5" y2="8" />
      <Line x1="20.5" y1="8" x2="22" y2="8" />
    </Svg>
  );
}

export function GearIcon({ size = 22, color = '#fff', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <Path d="M10.3 2.5h3.4l.5 2.6a7.6 7.6 0 0 1 1.9 1.1l2.5-.9 1.7 2.9-2 1.7a7.6 7.6 0 0 1 0 2.2l2 1.7-1.7 2.9-2.5-.9a7.6 7.6 0 0 1-1.9 1.1l-.5 2.6h-3.4l-.5-2.6a7.6 7.6 0 0 1-1.9-1.1l-2.5.9-1.7-2.9 2-1.7a7.6 7.6 0 0 1 0-2.2l-2-1.7 1.7-2.9 2.5.9a7.6 7.6 0 0 1 1.9-1.1Z" />
      <Circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function WifiIcon({ size = 20, color = '#3ccf6e', strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M2.5 9a14 14 0 0 1 19 0" />
      <Path d="M5.5 12.5a9.5 9.5 0 0 1 13 0" />
      <Path d="M8.6 15.8a5 5 0 0 1 6.8 0" />
      <Circle cx="12" cy="19" r="1.2" fill={color} stroke="none" />
    </Svg>
  );
}

export function UsbIcon({ size = 20, color = '#3ccf6e', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="12" y1="3" x2="12" y2="18" />
      <Path d="M9.5 5.5 12 3l2.5 2.5" />
      <Path d="M12 14l-4.5-2.5V9" />
      <Path d="M12 12l4.5-2.5V7.5" />
      <Circle cx="7.5" cy="8" r="1.2" />
      <Rect x="15.3" y="5.3" width="2.4" height="2.4" />
      <Circle cx="12" cy="19.5" r="1.8" />
    </Svg>
  );
}

export function FuelIcon({ size = 24, color = '#cfd2d6', strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg {...base(size)} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round">
      <Path d="M4.5 21V5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 14.5 5v16" />
      <Line x1="3" y1="21" x2="16" y2="21" />
      <Rect x="7" y="6" width="5" height="4" rx="0.5" />
      <Path d="M14.5 9.5h1.8a1.2 1.2 0 0 1 1.2 1.2v6a1.3 1.3 0 0 0 2.6 0V8.2L17.8 6" />
    </Svg>
  );
}

/** Low beam headlight: lamp with downward beams. */
export function HeadlightIcon({ size = 28, color = '#fff', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M13 5.5c4.2 0 7.5 3 7.5 6.5s-3.3 6.5-7.5 6.5c-.9 0-1.5-2.9-1.5-6.5s.6-6.5 1.5-6.5Z" />
      <Line x1="3" y1="7.5" x2="9" y2="8.5" />
      <Line x1="3" y1="11" x2="9" y2="12" />
      <Line x1="3" y1="14.5" x2="9" y2="15.5" />
      <Line x1="3" y1="18" x2="9" y2="19" />
    </Svg>
  );
}

/** High beam / flash: lamp with straight horizontal beams. */
export function HighBeamIcon({ size = 28, color = '#fff', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M13 5.5c4.2 0 7.5 3 7.5 6.5s-3.3 6.5-7.5 6.5c-.9 0-1.5-2.9-1.5-6.5s.6-6.5 1.5-6.5Z" />
      <Line x1="2.5" y1="7.5" x2="9" y2="7.5" />
      <Line x1="2.5" y1="10.5" x2="9" y2="10.5" />
      <Line x1="2.5" y1="13.5" x2="9" y2="13.5" />
      <Line x1="2.5" y1="16.5" x2="9" y2="16.5" />
    </Svg>
  );
}

export function HazardIcon({ size = 28, color = '#fff', strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg {...base(size)} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <Path d="M12 2.8 22 20H2Z" />
      <Path d="M12 9 16.3 16.6H7.7Z" />
    </Svg>
  );
}

export function WiperIcon({ size = 28, color = '#fff', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2.5 9.5C8.5 4 15.5 4 21.5 9.5L18.5 18h-13Z" />
      <Line x1="12" y1="18" x2="6.5" y2="8" />
      <Circle cx="12" cy="18" r="1" fill={color} />
    </Svg>
  );
}

export function BeaconIcon({ size = 28, color = '#fff', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M7 18v-5a5 5 0 0 1 10 0v5" />
      <Line x1="4.5" y1="18" x2="19.5" y2="18" />
      <Line x1="4" y1="21" x2="20" y2="21" />
      <Line x1="12" y1="2.5" x2="12" y2="5" />
      <Line x1="4.5" y1="5.5" x2="6.3" y2="7.3" />
      <Line x1="19.5" y1="5.5" x2="17.7" y2="7.3" />
      <Line x1="2" y1="12" x2="4.2" y2="12" />
      <Line x1="22" y1="12" x2="19.8" y2="12" />
    </Svg>
  );
}

export function CameraIcon({ size = 28, color = '#fff', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <Rect x="2.5" y="6" width="13.5" height="12" rx="2" />
      <Path d="M16 10.5 21.5 7.5v9L16 13.5Z" />
    </Svg>
  );
}

export function CruiseIcon({ size = 28, color = '#fff', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4.2 17.5a8.5 8.5 0 1 1 15.6 0" />
      <Line x1="12" y1="13.5" x2="16.2" y2="9" />
      <Circle cx="12" cy="13.5" r="1.4" fill={color} />
      <Path d="M3 7.5 5 9.5" />
      <Path d="M2.5 4.5h3.5v3.5" />
    </Svg>
  );
}

export function ParkingIcon({ size = 28, color = '#fff', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Circle cx="12" cy="12" r="7" />
      <Path d="M4.2 5.5a10 10 0 0 0 0 13" />
      <Path d="M19.8 5.5a10 10 0 0 1 0 13" />
      <SvgText x="12" y="15.6" fill={color} stroke="none" fontSize="10" fontWeight="700" textAnchor="middle">
        P
      </SvgText>
    </Svg>
  );
}

export function ArrowIcon({ size = 28, color = '#fff', strokeWidth = 1.9, dir = 'left' }: IconProps & { dir?: 'left' | 'right' }) {
  return (
    <Svg {...base(size)} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <G transform={dir === 'right' ? 'translate(24 0) scale(-1 1)' : undefined}>
        <Path d="M3 12 10.5 4.5V8.8h10.5v6.4H10.5v4.3Z" />
      </G>
    </Svg>
  );
}

export function HornIcon({ size = 30, color = '#f2b81e', strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round">
      <Path d="M2.5 7.5c3 1.2 4.5 1.5 9.5 1.5s6.5-1.7 9.5-4v13c-3-2.3-4.5-4-9.5-4s-6.5.3-9.5 1.5Z" />
      <Path d="M8 14.5c0 2.6 1.6 4.5 4 4.5s4-1.6 4-4" />
    </Svg>
  );
}
