import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useT } from '../lib/theme';

// The PING mark: a P that is also a speech bubble; the counter is the "ping".
const P = 'M24 42A30 30 0 1 1 54 72H44V80Q44 86 38 86H30Q24 86 24 80ZM54 31A11 11 0 1 0 54.01 31Z';

export function Mark({ size = 48, colors }: { size?: number; colors?: [string, string] }) {
  const t = useT();
  const [a, b] = colors ?? t.grad;
  const id = `mark${a}${b}`.replace(/#/g, '');
  return (
    <Svg width={size} height={size} viewBox="22 10 64 78">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={a} />
          <Stop offset="1" stopColor={b} />
        </LinearGradient>
      </Defs>
      <Path d={P} fill={`url(#${id})`} fillRule="evenodd" />
    </Svg>
  );
}
