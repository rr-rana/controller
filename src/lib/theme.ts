export const C = {
  bg: '#0b0d10',
  bgTop: '#101318',
  panel: '#15181d',
  panelHi: '#1c2027',
  line: '#2a2f37',
  lineHi: '#3a404a',
  text: '#ecebe7',
  dim: '#8d939c',
  faint: '#5b616b',
  gold: '#f2b81e',
  goldDeep: '#b9850c',
  goldGlow: 'rgba(242,184,30,0.35)',
  ok: '#3ccf6e',
  bad: '#ff5d52',
  warn: '#f0a52b',
  metalHi: '#e9ebee',
  metalMid: '#aeb3ba',
  metalLo: '#6c7179',
} as const;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
