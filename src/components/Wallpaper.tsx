import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern, Rect } from 'react-native-svg';
import { useT } from '../lib/theme';

export const WALLS: [string, string][] = [
  ['none', 'Plain'],
  ['glow', 'Glow'],
  ['dots', 'Dots'],
  ['grid', 'Grid'],
];

export function Wallpaper({ kind }: { kind: string | null }) {
  const t = useT();
  if (!kind || kind === 'none') return null;
  const ink = t.accent + (t.dark ? '1C' : '26');
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {kind === 'glow' && (
        <>
          <LinearGradient
            colors={[t.grad[0] + (t.dark ? '2E' : '3A'), t.bg + '00']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '55%' }}
          />
          <LinearGradient
            colors={[t.bg + '00', t.grad[1] + (t.dark ? '24' : '30')]}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%' }}
          />
        </>
      )}
      {(kind === 'dots' || kind === 'grid') && (
        <Svg width="100%" height="100%">
          <Defs>
            <Pattern id="wall" width={kind === 'dots' ? 22 : 28} height={kind === 'dots' ? 22 : 28} patternUnits="userSpaceOnUse">
              {kind === 'dots' ? <Circle cx={11} cy={11} r={1.6} fill={ink} /> : <Path d="M28 0H0V28" stroke={ink} strokeWidth={1} fill="none" />}
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#wall)" />
        </Svg>
      )}
    </View>
  );
}
