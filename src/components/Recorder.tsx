import { Ionicons } from '@expo/vector-icons';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { duration } from '../lib/time';
import { useT } from '../lib/theme';
import { stopVoice } from '../lib/voice';
import { haptic, notify } from './ui';

const OPTIONS = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 48_000, isMeteringEnabled: true };
const BARS = 36;
const TAP_MS = 350;

function bars(levels: number[]) {
  if (!levels.length) return [];
  const out = Array.from({ length: BARS }, (_, i) => {
    const a = Math.floor((i * levels.length) / BARS);
    const b = Math.max(a + 1, Math.floor(((i + 1) * levels.length) / BARS));
    const slice = levels.slice(a, b);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
  const max = Math.max(...out, 0.05);
  return out.map((v) => Math.round((v / max) * 100) / 100);
}

// Hold the mic to record and release to send; a quick tap locks recording on with send and discard buttons.
export function useRecorder(onDone: (uri: string, dur: number, wave: number[]) => void) {
  const rec = useAudioRecorder(OPTIONS);
  const state = useAudioRecorderState(rec, 100);
  const [mode, setMode] = useState<'idle' | 'hold' | 'locked'>('idle');
  const levels = useRef<number[]>([]);
  const pressAt = useRef(0);
  const starting = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    if (mode !== 'idle' && state.isRecording && state.metering !== undefined) levels.current.push(Math.max(0, (state.metering + 55) / 55));
  }, [state.durationMillis, state.metering, state.isRecording, mode]);

  const start = async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      notify('Microphone needed', 'Allow microphone access in Settings to send voice messages.');
      return false;
    }
    stopVoice();
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await rec.prepareToRecordAsync();
    levels.current = [];
    rec.record();
    haptic.medium();
    return true;
  };

  const finish = async (send: boolean) => {
    const ok = await starting.current;
    starting.current = null;
    setMode('idle');
    if (!ok) return;
    const dur = rec.currentTime;
    await rec.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (send && rec.uri && dur >= 0.8) {
      haptic.light();
      onDone(rec.uri, dur, bars(levels.current));
    }
  };

  return {
    mode,
    pressIn: () => {
      if (mode === 'locked') return;
      pressAt.current = Date.now();
      setMode('hold');
      starting.current = start();
    },
    pressOut: () => {
      if (mode !== 'hold') return;
      if (Date.now() - pressAt.current < TAP_MS) {
        starting.current?.then((ok) => setMode(ok ? 'locked' : 'idle'));
      } else finish(true);
    },
    send: () => finish(true),
    cancel: () => finish(false),
    secs: state.durationMillis / 1000,
    level: state.metering === undefined ? 0 : Math.max(0, (state.metering + 55) / 55),
  };
}

export function RecordingBar({ r }: { r: ReturnType<typeof useRecorder> }) {
  const t = useT();
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.25, { duration: 600 }), -1, true);
  }, [pulse]);
  const dot = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(120)}
      style={{
        flex: 1,
        minHeight: 48,
        borderRadius: 24,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.line,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        gap: 10,
      }}
    >
      {r.mode === 'locked' ? (
        <Pressable
          onPress={r.cancel}
          accessibilityLabel="Discard recording"
          hitSlop={6}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="trash-outline" size={21} color={t.red} />
        </Pressable>
      ) : (
        <View style={{ width: 8 }} />
      )}
      <Animated.View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.red }, dot]} />
      <Text style={{ color: t.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{duration(r.secs)}</Text>
      <View style={{ flex: 1, height: 24, flexDirection: 'row', alignItems: 'center', gap: 2, overflow: 'hidden' }}>
        <View style={{ height: Math.max(3, r.level * 24), width: 4, borderRadius: 2, backgroundColor: t.accent }} />
        <Text style={{ color: t.dim, fontSize: 12.5, marginLeft: 8 }}>{r.mode === 'locked' ? 'Recording' : 'Release to send'}</Text>
      </View>
    </Animated.View>
  );
}
