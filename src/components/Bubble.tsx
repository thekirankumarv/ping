import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, FadeInDown, FadeOut, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { summary, type Msg } from '../lib/core';
import { clock, left } from '../lib/time';
import { useLook, useT } from '../lib/theme';
import { Markdown } from './Markdown';
import { FileBody, ImageBody, LinkCard, OnceBody, VoiceBody, type Ink } from './Media';
import { haptic } from './ui';

const LONG = 1200;
const REPLY_AT = 64;
const ease = Easing.out(Easing.cubic);

type Props = {
  m: Msg;
  // Same sender as the message above/below, for grouped corners.
  joinTop: boolean;
  joinBottom: boolean;
  quoted?: Msg | null;
  quotedName: string;
  flash: boolean;
  fresh: boolean;
  scheduled: boolean;
  now: number;
  onReply: (m: Msg) => void;
  onMenu: (m: Msg) => void;
  onJump: (id: string) => void;
  onToggle: (m: Msg, line: number, done: boolean) => void;
};

export const Bubble = memo(function Bubble(p: Props) {
  const { m } = p;
  const t = useT();
  const style = useLook((l) => l.bubble);
  const { width: screen } = useWindowDimensions();
  const x = useSharedValue(0);
  const passed = useSharedValue(false);

  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-12, 12],
    enabled: !m.gone,
    onUpdate: (e) => {
      'worklet';
      x.value = Math.max(0, Math.min(96, e.translationX * 0.6));
      if (x.value >= REPLY_AT !== passed.value) {
        passed.value = x.value >= REPLY_AT;
        if (passed.value) runOnJS(haptic.light)();
      }
    },
    onDeactivate: () => {
      'worklet';
      if (passed.value) runOnJS(p.onReply)(m);
      passed.value = false;
      x.value = withTiming(0, { duration: 220, easing: ease });
    },
  });
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const hint = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [16, REPLY_AT], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(x.value, [16, REPLY_AT], [0.6, 1], 'clamp') }],
  }));

  if (m.kind === 'sys' || m.kind === 'call')
    return (
      <View style={{ alignItems: 'center', marginVertical: 10, paddingHorizontal: 30 }}>
        <View
          style={{
            backgroundColor: t.surface2,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 6,
            flexDirection: 'row',
            gap: 6,
            alignItems: 'center',
          }}
        >
          <Ionicons
            name={m.kind === 'sys' ? 'timer-outline' : m.body.startsWith('Missed') ? 'call' : m.body.includes('Video') ? 'videocam' : 'call-outline'}
            size={13}
            color={m.body.startsWith('Missed') ? t.red : t.sub}
          />
          <Text style={{ color: t.sub, fontSize: 12.5, fontWeight: '600', textAlign: 'center' }}>{m.body}</Text>
        </View>
      </View>
    );

  const mine = !!m.mine;
  const minimal = style === 'minimal';
  const fg = mine && !minimal ? t.onAccent : t.text;
  const on = mine && !minimal;
  const sub = on ? t.onAccentSub : t.sub;
  const strong = on ? t.onAccent : t.accent;
  const R = style === 'square' ? 8 : 20;
  const r = style === 'square' ? 4 : 6;
  const corners = mine
    ? { borderTopRightRadius: p.joinTop ? r : R, borderBottomRightRadius: p.joinBottom ? r : R }
    : { borderTopLeftRadius: p.joinTop ? r : R, borderBottomLeftRadius: p.joinBottom ? r : R };
  const ink: Ink = { fg, sub, strong, on };
  const tight = m.kind === 'image' && !m.once && !m.gone;
  const mediaW = Math.min(screen * 0.68, 280);
  const long = m.body.length > LONG || m.body.split('\n').length > 24;
  const reacts = Object.values(JSON.parse(m.reacts) as Record<string, string>);
  const exp = m.exp ? left(m.exp - p.now) : m.ttl === -1 ? '1×' : '';
  const tick = !mine
    ? null
    : m.status === 0
      ? { name: 'time-outline' as const, c: sub }
      : m.status === 1
        ? { name: 'checkmark' as const, c: sub }
        : { name: 'checkmark-done' as const, c: m.status === 3 ? strong : sub };

  return (
    <Animated.View
      entering={p.fresh ? FadeInDown.duration(260).easing(ease) : undefined}
      exiting={FadeOut.duration(320)}
      style={{ paddingHorizontal: 10, marginTop: p.joinTop ? 2 : 8, marginBottom: reacts.length ? 14 : 0 }}
    >
      <Animated.View style={[{ position: 'absolute', left: 14, top: 0, bottom: 0, justifyContent: 'center' }, hint]}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-undo" size={16} color={t.text} />
        </View>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ alignItems: mine ? 'flex-end' : 'flex-start' }, slide]}>
          <Pressable
            onLongPress={() => (haptic.medium(), p.onMenu(m))}
            delayLongPress={260}
            style={({ pressed }) => [
              {
                maxWidth: '84%',
                borderRadius: R,
                paddingHorizontal: tight ? 4 : 13,
                paddingTop: tight ? 4 : 8,
                paddingBottom: tight ? 4 : 6,
                backgroundColor: minimal ? 'transparent' : mine ? t.mine : t.theirs,
                overflow: 'hidden',
                borderWidth: minimal || (!mine && !t.dark) ? 1 : 0,
                borderColor: minimal && mine ? t.accent + '66' : t.line,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
              corners,
              p.flash && { backgroundColor: t.accent + (mine ? 'CC' : '40') },
            ]}
          >
            {on && !p.flash && <LinearGradient colors={t.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
            {p.quoted !== undefined && m.reply && (
              <Pressable
                onPress={() => p.onJump(m.reply!)}
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  marginBottom: 6,
                  borderRadius: 10,
                  overflow: 'hidden',
                  backgroundColor: on ? 'rgba(0,0,0,0.12)' : t.surface,
                }}
              >
                <View style={{ width: 3, backgroundColor: strong }} />
                <View style={{ paddingVertical: 6, paddingRight: 10, flexShrink: 1 }}>
                  <Text style={{ color: strong, fontSize: 12.5, fontWeight: '800' }}>{p.quotedName}</Text>
                  <Text numberOfLines={2} style={{ color: sub, fontSize: 13 }}>
                    {p.quoted ? summary(p.quoted) : 'Message not available'}
                  </Text>
                </View>
              </Pressable>
            )}

            {m.gone ? (
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Ionicons name="ban-outline" size={14} color={sub} />
                <Text style={{ color: sub, fontStyle: 'italic', fontSize: 14.5 }}>{mine ? 'You deleted this message' : 'This message was deleted'}</Text>
              </View>
            ) : (
              <View style={long ? { maxHeight: 420, overflow: 'hidden' } : undefined}>
                {m.kind === 'image' && (m.once ? <OnceBody m={m} ink={ink} /> : <ImageBody m={m} ink={ink} width={mediaW} />)}
                {m.kind === 'file' && <FileBody m={m} ink={ink} />}
                {m.kind === 'voice' && <VoiceBody m={m} ink={ink} />}
                {!!m.body && (
                  <View style={m.kind !== 'text' ? { paddingHorizontal: tight ? 8 : 0, paddingTop: 6 } : undefined}>
                    <Markdown src={m.body} color={fg} sub={sub} onToggle={(line, done) => p.onToggle(m, line, done)} />
                  </View>
                )}
                {m.kind === 'text' && <LinkCard m={m} ink={ink} width={Math.min(mediaW, 260)} />}
                {long && (
                  <LinearGradient
                    colors={[(minimal ? t.bg : mine ? t.grad[1] : t.theirs) + '00', minimal ? t.bg : mine ? t.grad[1] : t.theirs]}
                    style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 90 }}
                    pointerEvents="none"
                  />
                )}
              </View>
            )}
            {long && !m.gone && (
              <Pressable onPress={() => router.push(`/read/${m.id}`)} hitSlop={6} style={{ paddingTop: 6 }}>
                <Text style={{ color: strong, fontWeight: '800', fontSize: 14 }}>Read more</Text>
              </Pressable>
            )}

            <View
              style={{
                flexDirection: 'row',
                alignSelf: 'flex-end',
                alignItems: 'center',
                gap: 4,
                marginTop: 2,
                paddingRight: tight ? 8 : 0,
                paddingBottom: tight ? 2 : 0,
              }}
            >
              {p.scheduled && (
                <>
                  <Ionicons name="alarm-outline" size={12} color={sub} />
                  <Text style={{ color: sub, fontSize: 11 }}>Scheduled</Text>
                </>
              )}
              {!!m.pin && <Ionicons name="pin" size={11} color={sub} />}
              {!!exp && (
                <>
                  <Ionicons name="timer-outline" size={12} color={sub} />
                  <Text style={{ color: sub, fontSize: 11 }}>{exp}</Text>
                </>
              )}
              {!!m.edited && !m.gone && <Text style={{ color: sub, fontSize: 11, fontStyle: 'italic' }}>edited</Text>}
              {!!m.star && <Ionicons name="star" size={11} color={sub} />}
              <Text style={{ color: sub, fontSize: 11 }}>{clock(m.ts)}</Text>
              {tick && <Ionicons name={tick.name} size={15} color={tick.c} />}
            </View>
          </Pressable>
          {reacts.length > 0 && (
            <Animated.View
              entering={FadeInDown.duration(200)}
              style={{
                position: 'absolute',
                bottom: -14,
                [mine ? 'right' : 'left']: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 2,
                backgroundColor: t.surface2,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: t.bg,
                paddingHorizontal: 6,
                paddingVertical: 1,
              }}
            >
              <Text style={{ fontSize: 14 }}>{[...new Set(reacts)].join('')}</Text>
              {reacts.length > 1 && <Text style={{ color: t.sub, fontSize: 11.5, fontWeight: '700' }}>{reacts.length}</Text>}
            </Animated.View>
          )}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
});
