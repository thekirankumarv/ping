import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { cancelAnimation, Easing, FadeIn, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { confirm, haptic, IconBtn, Sheet, toast } from '../../components/ui';
import * as core from '../../lib/core';
import { useLive } from '../../lib/db';
import { listTime } from '../../lib/time';
import { DISPLAY, isPreset, presetTheme, useT } from '../../lib/theme';

const SHOW_MS = 5500;

function Bar({ i, at, progress }: { i: number; at: number; progress: SharedValue<number> }) {
  const fill = useAnimatedStyle(() => ({ width: `${(i < at ? 1 : i > at ? 0 : progress.value) * 100}%` }));
  return (
    <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
      <Animated.View style={[{ height: 3, backgroundColor: '#fff' }, fill]} />
    </View>
  );
}

function StoryBody({ st, onReady }: { st: core.Story; onReady?: () => void }) {
  const { width } = useWindowDimensions();
  const x = core.storyMeta(st);
  useEffect(() => {
    if (st.kind === 'text') onReady?.();
  }, [st, onReady]);
  if (st.kind === 'text') {
    const grad = presetTheme(isPreset(x.bg) ? x.bg : 'aurora').grad;
    return (
      <LinearGradient
        colors={grad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}
      >
        <Text
          style={{
            color: '#fff',
            fontSize: st.body.length > 120 ? 26 : 36,
            lineHeight: st.body.length > 120 ? 34 : 44,
            fontFamily: DISPLAY,
            textAlign: 'center',
            textShadowColor: 'rgba(0,0,0,0.25)',
            textShadowRadius: 12,
          }}
        >
          {st.body}
        </Text>
      </LinearGradient>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
      {x.thumb && (
        <Image
          source={{ uri: `data:image/jpeg;base64,${x.thumb}` }}
          blurRadius={30}
          contentFit="cover"
          style={{ position: 'absolute', inset: 0, opacity: 0.6 }}
        />
      )}
      {x.local ? (
        <Image source={{ uri: x.local }} contentFit="contain" style={{ width, flex: 1 }} onLoad={onReady} transition={150} />
      ) : (
        <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>Loading…</Text>
      )}
    </View>
  );
}

export default function StoryViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const ins = useSafeAreaInsets();
  const mine = id === core.myId();
  const [list] = useState(() => core.storiesOf(id));
  const [at, setAt] = useState(() => Math.max(0, mine ? 0 : list.findIndex((s) => !s.seen)));
  const [sheet, setSheet] = useState(false);
  const [reply, setReply] = useState('');
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const paused = useRef(false);
  const st = useLive(() => core.storiesOf(id).find((s) => s.id === list[at]?.id) ?? null, `${id}${at}`, core.STORIES);
  const seenBy = useLive(() => (st && mine ? core.viewers(st.id) : []), `${st?.id}`, core.STORIES);
  const c = core.contact(id);

  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/')), []);
  const go = useCallback(
    (d: number) => {
      const next = at + d;
      if (next < 0) return progress.set(0);
      if (next >= list.length) return mine ? undefined : close();
      progress.set(0);
      setAt(next);
    },
    [at, list.length, close, progress, mine],
  );
  const run = useCallback(() => {
    if (paused.current) return;
    progress.set(withTiming(1, { duration: SHOW_MS * (1 - progress.get()), easing: Easing.linear }, (done) => done && runOnJS(go)(1)));
  }, [go, progress]);
  const pause = (on: boolean) => {
    paused.current = on;
    if (on) cancelAnimation(progress);
    else run();
  };

  useEffect(() => {
    if (st && !mine) core.viewStory(st.id);
  }, [st, mine]);
  useEffect(() => {
    if (!list.length) close();
  }, [list.length, close]);

  const pan = usePanGesture({
    activeOffsetY: [-10, 10],
    onUpdate: (e) => {
      'worklet';
      drag.value = Math.max(0, e.translationY);
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationY > 120) runOnJS(close)();
      else drag.value = withTiming(0, { duration: 200 });
    },
  });
  const card = useAnimatedStyle(() => ({ transform: [{ translateY: drag.value }, { scale: 1 - drag.value / 2000 }], borderRadius: drag.value ? 24 : 0 }));

  if (!st) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  const name = mine ? 'My story' : (c?.label ?? '');

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar style="light" />
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flex: 1, overflow: 'hidden' }, card]}>
          <StoryBody key={st.id} st={st} onReady={run} />
          <View style={{ position: 'absolute', inset: 0, flexDirection: 'row' }}>
            <Pressable
              style={{ flex: 1 }}
              onPress={() => go(-1)}
              onLongPress={() => pause(true)}
              onPressOut={() => paused.current && pause(false)}
              delayLongPress={180}
            />
            <Pressable
              style={{ flex: 2 }}
              onPress={() => go(1)}
              onLongPress={() => pause(true)}
              onPressOut={() => paused.current && pause(false)}
              delayLongPress={180}
            />
          </View>
          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'transparent']}
            pointerEvents="box-none"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: ins.top + 8, paddingHorizontal: 10, paddingBottom: 30 }}
          >
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {list.map((s, i) => (
                <Bar key={s.id} i={i} at={at} progress={progress} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <Avatar seed={c?.pub ?? id} label={name} size={36} self={mine} icon="person" />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15.5 }}>{name}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, flex: 1 }}>{listTime(st.ts)}</Text>
              {mine && (
                <IconBtn
                  name="trash-outline"
                  color="#fff"
                  label="Delete story"
                  onPress={() => {
                    pause(true);
                    confirm('Delete this story?', 'It disappears for everyone.', 'Delete', () => (core.deleteStory(st.id), close()), true);
                  }}
                />
              )}
              <IconBtn name="close" color="#fff" label="Close" onPress={close} />
            </View>
          </LinearGradient>
          {!!st.body && st.kind === 'image' && (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: mine ? 110 : 120, paddingHorizontal: 24 }}>
              <Text style={{ color: '#fff', fontSize: 17, lineHeight: 23, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8 }}>
                {st.body}
              </Text>
            </View>
          )}
        </Animated.View>
      </GestureDetector>

      <KeyboardAvoidingView behavior="padding" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: ins.bottom + 12 }}>
          {mine ? (
            <Pressable
              onPress={() => (pause(true), setSheet(true))}
              style={{
                alignSelf: 'center',
                alignItems: 'center',
                gap: 2,
                paddingVertical: 8,
                paddingHorizontal: 18,
                borderRadius: 20,
                backgroundColor: 'rgba(0,0,0,0.5)',
              }}
              accessibilityLabel="Seen by"
            >
              <Ionicons name="eye-outline" size={22} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800' }}>{seenBy.length ? `Seen by ${seenBy.length}` : 'No views yet'}</Text>
            </Pressable>
          ) : (
            c?.state === 'ok' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  value={reply}
                  onChangeText={setReply}
                  onFocus={() => pause(true)}
                  onBlur={() => pause(false)}
                  placeholder={`Reply to ${name}…`}
                  placeholderTextColor="rgba(255,255,255,0.7)"
                  selectionColor={t.accent}
                  style={{
                    flex: 1,
                    color: '#fff',
                    fontSize: 15.5,
                    height: 48,
                    borderRadius: 24,
                    paddingHorizontal: 18,
                    borderWidth: 1.5,
                    borderColor: 'rgba(255,255,255,0.5)',
                    backgroundColor: 'rgba(0,0,0,0.25)',
                  }}
                />
                <Pressable
                  disabled={!reply.trim()}
                  onPress={() => {
                    const what = st.kind === 'text' ? st.body.slice(0, 60) : st.body ? `📷 ${st.body.slice(0, 50)}` : '📷 Photo';
                    core.sendText(id, `> ↩︎ Story: ${what}\n${reply.trim()}`);
                    haptic.light();
                    setReply('');
                    toast('Reply sent', 'paper-plane');
                  }}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: reply.trim() ? t.grad[0] : 'rgba(255,255,255,0.15)',
                  }}
                  accessibilityLabel="Send reply"
                >
                  <Ionicons name="arrow-up" size={22} color={reply.trim() ? t.onAccent : '#fff'} />
                </Pressable>
              </View>
            )
          )}
        </View>
      </KeyboardAvoidingView>

      <Sheet visible={sheet} onClose={() => (setSheet(false), pause(false))} title={`Seen by ${seenBy.length}`}>
        {seenBy.length ? (
          seenBy.map((v) => {
            const who = core.contact(v.viewer);
            return (
              <Animated.View key={v.viewer} entering={FadeIn} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                <Avatar seed={who?.pub ?? v.viewer} label={who?.label ?? '?'} size={42} />
                <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: '700' }}>{who?.label ?? 'Someone'}</Text>
                <Text style={{ color: t.sub, fontSize: 13 }}>{listTime(v.ts)}</Text>
              </Animated.View>
            );
          })
        ) : (
          <Text style={{ color: t.sub, paddingVertical: 12 }}>Nobody has seen this yet.</Text>
        )}
      </Sheet>
    </View>
  );
}
