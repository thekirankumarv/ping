import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconBtn } from '../../components/ui';
import * as core from '../../lib/core';
import { clock, dayLabel } from '../../lib/time';

const ease = Easing.out(Easing.cubic);

export default function Viewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ins = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [m] = useState(() => core.message(id));
  const x = m ? core.metaOf(m) : {};
  const once = !!m?.once && !m.mine;
  const [left, setLeft] = useState(10);

  const scale = useSharedValue(1);
  const base = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const dim = useSharedValue(1);

  // View once: no screenshots while open, gone for good on close, closes itself after 10 s.
  useEffect(() => {
    if (!once) return;
    ScreenCapture.preventScreenCaptureAsync('once').catch(() => {});
    const iv = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => {
      clearInterval(iv);
      ScreenCapture.allowScreenCaptureAsync('once').catch(() => {});
      core.openOnce(id);
    };
  }, [once, id]);
  useEffect(() => {
    if (once && left <= 0) router.back();
  }, [once, left]);

  const close = () => router.back();
  const pinch = usePinchGesture({
    onUpdate: (e) => {
      'worklet';
      scale.value = Math.max(1, Math.min(5, base.value * e.scale));
    },
    onDeactivate: () => {
      'worklet';
      base.value = scale.value;
      if (scale.value <= 1.02) {
        scale.value = withTiming(1, { duration: 200, easing: ease });
        base.value = 1;
        tx.value = withTiming(0);
        ty.value = withTiming(0);
      }
    },
  });
  const pan = usePanGesture({
    onUpdate: (e) => {
      'worklet';
      if (scale.value > 1) {
        tx.value = e.translationX;
        ty.value = e.translationY;
      } else {
        ty.value = e.translationY;
        dim.value = Math.max(0.2, 1 - Math.abs(e.translationY) / 500);
      }
    },
    onDeactivate: (e) => {
      'worklet';
      if (scale.value > 1) return;
      if (Math.abs(e.translationY) > 140 || Math.abs(e.velocityY) > 1200) runOnJS(close)();
      else {
        ty.value = withTiming(0, { duration: 220, easing: ease });
        dim.value = withTiming(1);
      }
    },
  });
  const double = useTapGesture({
    numberOfTaps: 2,
    onActivate: () => {
      'worklet';
      const next = scale.value > 1 ? 1 : 2.5;
      scale.value = withTiming(next, { duration: 240, easing: ease });
      base.value = next;
      tx.value = withTiming(0);
      ty.value = withTiming(0);
    },
  });
  const gesture = useSimultaneousGestures(pinch, pan, double);
  const img = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));
  const bg = useAnimatedStyle(() => ({ opacity: dim.value }));

  if (!m || !x.local) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Animated.View style={[{ position: 'absolute', inset: 0, backgroundColor: '#000' }, bg]} />
      <GestureDetector gesture={gesture}>
        <Animated.View style={[{ flex: 1 }, img]}>
          <Image source={{ uri: x.local }} contentFit="contain" style={{ width, height }} />
        </Animated.View>
      </GestureDetector>
      <Animated.View
        entering={FadeIn.duration(250)}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          paddingTop: ins.top + 4,
          paddingHorizontal: 6,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.35)',
        }}
      >
        <IconBtn name="close" color="#fff" label="Close" onPress={close} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{m.mine ? 'You' : (core.contact(m.chat)?.label ?? '')}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12.5 }}>
            {dayLabel(m.ts)}, {clock(m.ts)}
          </Text>
        </View>
        {once ? (
          <Text style={{ color: '#fff', fontWeight: '800', paddingHorizontal: 14 }}>{left}s</Text>
        ) : (
          <IconBtn name="share-outline" color="#fff" label="Share or save" onPress={() => Sharing.shareAsync(x.local!, { mimeType: 'image/jpeg' })} />
        )}
      </Animated.View>
      {!!m.body && !once && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, paddingBottom: ins.bottom + 18, backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <Text style={{ color: '#fff', fontSize: 15.5, lineHeight: 21 }}>{m.body}</Text>
        </View>
      )}
    </View>
  );
}
