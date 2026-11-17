import { createContext, useContext, useMemo } from 'react';
import { Appearance, Platform } from 'react-native';
import { create } from 'zustand';
import { readPrefs, writePrefs } from './prefs';

// Brand presets: one accent for small marks, a two-stop gradient for big surfaces (own bubbles, FAB, hero).
export const PRESETS = {
  volt: { name: 'Volt', accent: '#C6FF3A', grad: ['#D9FF4D', '#6CF59A'] },
  ion: { name: 'Ion', accent: '#38D6FF', grad: ['#4AE3FF', '#4F6BFF'] },
  aurora: { name: 'Aurora', accent: '#A98BFF', grad: ['#8C6BFF', '#FF5FA2'] },
  ember: { name: 'Ember', accent: '#FF7F50', grad: ['#FFA94D', '#FF4D6A'] },
  mint: { name: 'Mint', accent: '#3FE6B0', grad: ['#5CF0C0', '#16B3A3'] },
  mono: { name: 'Mono', accent: '#E9EBF2', grad: ['#FFFFFF', '#AEB3C2'] },
} as const;
export type Preset = keyof typeof PRESETS;

const base = {
  dark: {
    dark: true,
    bg: '#07080C',
    surface: '#0F1117',
    surface2: '#181B24',
    line: '#1F2330',
    text: '#F3F5FA',
    sub: '#8C92A4',
    dim: '#545A6C',
    theirs: '#151821',
    red: '#FF5470',
    green: '#2EE59D',
    amber: '#FFB547',
  },
  amoled: {
    dark: true,
    bg: '#000000',
    surface: '#0A0B0F',
    surface2: '#13151B',
    line: '#1B1E27',
    text: '#F3F5FA',
    sub: '#868C9E',
    dim: '#4E5466',
    theirs: '#111318',
    red: '#FF5470',
    green: '#2EE59D',
    amber: '#FFB547',
  },
  light: {
    dark: false,
    bg: '#F3F4F8',
    surface: '#FFFFFF',
    surface2: '#E9EBF1',
    line: '#E0E3EA',
    text: '#0A0C12',
    sub: '#5A6073',
    dim: '#9AA0B3',
    theirs: '#FFFFFF',
    red: '#E5364F',
    green: '#0FA36B',
    amber: '#C98300',
  },
};

export type Mode = 'system' | 'dark' | 'amoled' | 'light';
export type Bubble = 'round' | 'square' | 'minimal';
type Look = { mode: Mode; preset: Preset; bubble: Bubble; font: number };

export const PREFS = 'ping.prefs.json';
const saved = readPrefs(PREFS) as Partial<Look>;
const sys = () => (Appearance.getColorScheme() === 'light' ? 'light' : 'dark');
const scheme = (m: Mode) => (m === 'system' ? sys() : m);

export const useLook = create<Look & { scheme: keyof typeof base }>()(() => {
  const look: Look = {
    mode: saved.mode ?? 'dark',
    preset: saved.preset && saved.preset in PRESETS ? saved.preset : 'volt',
    bubble: saved.bubble ?? 'round',
    font: saved.font ?? 1,
  };
  return { ...look, scheme: scheme(look.mode) };
});

export function setLook(p: Partial<Look>) {
  const { scheme: _, ...cur } = useLook.getState();
  const next = { ...cur, ...p };
  writePrefs(PREFS, { ...readPrefs(PREFS), ...next });
  useLook.setState({ ...next, scheme: scheme(next.mode) });
}
Appearance.addChangeListener(() => useLook.getState().mode === 'system' && useLook.setState({ scheme: sys() }));

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
export const mix = (a: string, b: string, t: number) => {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
};
// WCAG relative luminance.
export function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function make(s: keyof typeof base, preset: Preset) {
  const b = base[s];
  const p0 = PRESETS[preset];
  // Mono's near-white gradient would vanish on the light background; flip it to ink there.
  const p = !b.dark && preset === 'mono' ? { ...p0, accent: '#1A1D26', grad: ['#3A3F4E', '#0A0C12'] as const } : p0;
  // Bright accents get dark text on top, and a deeper shade when used as text on light backgrounds.
  const onAccent = luminance(mix(p.grad[0], p.grad[1], 0.5)) > 0.4 ? '#07080C' : '#FFFFFF';
  const accent = b.dark ? p.accent : luminance(p.accent) > 0.35 ? mix(p.accent, '#000000', 0.45) : p.accent;
  return {
    ...b,
    accent,
    grad: [p.grad[0], p.grad[1]] as [string, string],
    accentDim: accent + (b.dark ? '24' : '1A'),
    mine: p.grad[0],
    onAccent,
    onAccentSub: onAccent === '#FFFFFF' ? 'rgba(255,255,255,0.72)' : 'rgba(7,8,12,0.6)',
    shadow: b.dark ? '#000000' : '#1B2240',
  };
}
export type Theme = ReturnType<typeof make>;

const cache = new Map<string, Theme>();
function theme(s: keyof typeof base, preset: Preset) {
  const k = s + preset;
  if (!cache.has(k)) cache.set(k, make(s, preset));
  return cache.get(k)!;
}
// A chat can override the accent for everything rendered inside it.
export const ChatPreset = createContext<Preset | null>(null);
export const useT = () => {
  const s = useLook((l) => l.scheme);
  const p = useLook((l) => l.preset);
  const local = useContext(ChatPreset);
  return theme(s, local ?? p);
};
export const isPreset = (p: string | null | undefined): p is Preset => !!p && p in PRESETS;
export const themeNow = () => theme(useLook.getState().scheme, useLook.getState().preset);
export const presetTheme = (p: Preset) => theme(useLook.getState().scheme, p);

export function styles<T>(build: (t: Theme) => T) {
  const memo = new Map<Theme, T>();
  return () => {
    const t = useT();
    return useMemo(() => {
      if (!memo.has(t)) memo.set(t, build(t));
      return memo.get(t)!;
    }, [t]);
  };
}

export const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, monospace' });
// Display face for the wordmark and headings; body text stays on the system font.
export const DISPLAY = 'SpaceGrotesk_700Bold';
export const DISPLAY_MED = 'SpaceGrotesk_600SemiBold';

// Two-stop gradient from a public key, so every contact has a stable avatar without a name or photo.
export function avatarColors(seed: string): [string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  return [`hsl(${a}, 78%, 62%)`, `hsl(${(a + 48) % 360}, 72%, 46%)`];
}
