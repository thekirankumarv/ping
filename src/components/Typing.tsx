import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useT } from '../lib/theme';

function Dot({ i, color, size }: { i: number; color: string; size: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(
      i * 140,
      withRepeat(withSequence(withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 320 })), -1),
    );
  }, [i, v]);
  const st = useAnimatedStyle(() => ({ opacity: 0.35 + v.value * 0.65, transform: [{ translateY: -v.value * size * 0.5 }] }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, st]} />;
}

export function TypingDots({ color, size = 6 }: { color?: string; size?: number }) {
  const t = useT();
  return (
    <View style={{ flexDirection: 'row', gap: size * 0.6, alignItems: 'center', height: size * 2 }}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} i={i} color={color ?? t.sub} size={size} />
      ))}
    </View>
  );
}

export function TypingBubble() {
  const t = useT();
  return (
    <View style={{ paddingHorizontal: 10, marginTop: 8, alignItems: 'flex-start' }}>
      <View
        style={{ backgroundColor: t.theirs, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, borderWidth: t.dark ? 0 : 1, borderColor: t.line }}
      >
        <TypingDots />
      </View>
    </View>
  );
}
