import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RTCView } from 'react-native-webrtc';
import { Avatar } from '../../components/Avatar';
import { haptic, type IconName } from '../../components/ui';
import { accept, decline, flipCamera, hangUp, startCall, toggleCamera, toggleMute, toggleSpeaker, useCall } from '../../lib/call';
import * as core from '../../lib/core';
import { duration } from '../../lib/time';
import { avatarColors, DISPLAY, useT } from '../../lib/theme';

function Round({
  icon,
  label,
  onPress,
  on,
  color,
  size = 64,
  hang,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  on?: boolean;
  color?: string;
  size?: number;
  hang?: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Pressable
        onPress={() => (haptic.light(), onPress())}
        accessibilityLabel={label}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color ?? (on ? '#fff' : 'rgba(255,255,255,0.16)'),
          transform: [{ scale: pressed ? 0.92 : 1 }],
        })}
      >
        <Ionicons
          name={icon}
          size={size * 0.42}
          color={color ? '#fff' : on ? '#07080C' : '#fff'}
          style={hang ? { transform: [{ rotate: '135deg' }] } : undefined}
        />
      </Pressable>
      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function Pulse({ children }: { children: React.ReactNode }) {
  const t = useT();
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.cubic) }), -1);
  }, [v]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - v.value), transform: [{ scale: 1 + v.value * 0.7 }] }));
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 2, borderColor: t.accent }, ring]} />
      {children}
    </View>
  );
}

export default function CallScreen() {
  const { id, video } = useLocalSearchParams<{ id: string; video?: string }>();
  const t = useT();
  const ins = useSafeAreaInsets();
  const c = core.contact(id);
  const call = useCall();
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const { phase } = useCall.getState();
    if (phase === 'idle' || phase === 'ended') startCall(id, video === '1');
  }, [id, video]);
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    const back = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => {
      clearInterval(iv);
      back.remove();
    };
  }, []);
  const active = useRef(false);
  useEffect(() => {
    if (call.phase !== 'idle') active.current = true;
    else if (active.current) router.back();
  }, [call.phase]);

  if (!c) return null;
  const status =
    call.phase === 'calling'
      ? 'Calling…'
      : call.phase === 'ringing'
        ? 'Ringing…'
        : call.phase === 'incoming'
          ? `Incoming ${call.video ? 'video' : 'voice'} call`
          : call.phase === 'connecting'
            ? 'Connecting…'
            : call.phase === 'live'
              ? duration((now - call.started) / 1000)
              : call.note;
  const showRemote = call.video && call.remote && call.phase === 'live';
  const showLocal = call.video && call.local && !call.camOff;

  return (
    <View style={{ flex: 1, backgroundColor: '#05060A' }}>
      <StatusBar style="light" />
      <LinearGradient colors={[avatarColors(c.pub)[1] + '66', '#05060A', '#05060A']} style={{ position: 'absolute', inset: 0 }} />
      {showRemote && <RTCView streamURL={call.remote!.toURL()} objectFit="cover" style={{ position: 'absolute', inset: 0 }} />}
      {showLocal && (
        <Animated.View
          entering={FadeIn.duration(300)}
          style={
            showRemote
              ? {
                  position: 'absolute',
                  right: 16,
                  top: ins.top + 16,
                  width: 112,
                  height: 168,
                  borderRadius: 18,
                  overflow: 'hidden',
                  borderWidth: 2,
                  borderColor: 'rgba(255,255,255,0.25)',
                }
              : { position: 'absolute', inset: 0 }
          }
        >
          <RTCView streamURL={call.local!.toURL()} objectFit="cover" mirror zOrder={1} style={{ flex: 1 }} />
        </Animated.View>
      )}
      {showLocal && !showRemote && <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(5,6,10,0.45)' }} />}

      <View style={{ flex: 1, paddingTop: ins.top + 70, alignItems: 'center', gap: 18 }}>
        {!showRemote && (
          <Animated.View entering={FadeInDown.duration(400)} style={{ alignItems: 'center', gap: 18 }}>
            {call.phase === 'live' ? (
              <Avatar seed={c.pub} label={c.label} size={112} />
            ) : (
              <Pulse>
                <Avatar seed={c.pub} label={c.label} size={112} />
              </Pulse>
            )}
            <Text style={{ color: '#fff', fontSize: 32, fontFamily: DISPLAY, letterSpacing: -1 }}>{c.label}</Text>
          </Animated.View>
        )}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: showRemote ? 'rgba(0,0,0,0.4)' : 'transparent',
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 4,
          }}
        >
          {call.phase === 'live' && <Ionicons name="lock-closed" size={13} color="rgba(255,255,255,0.7)" />}
          <Text style={{ color: call.phase === 'live' ? t.accent : 'rgba(255,255,255,0.75)', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
            {status}
          </Text>
        </View>
      </View>

      <View style={{ paddingBottom: ins.bottom + 36, paddingHorizontal: 24 }}>
        {call.phase === 'incoming' ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            <Round icon="close" label="Decline" color="#FF3B5C" size={72} onPress={decline} />
            <Round icon={call.video ? 'videocam' : 'call'} label="Accept" color="#1FC77E" size={72} onPress={accept} />
          </View>
        ) : call.phase === 'ended' ? null : (
          <View style={{ gap: 26 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <Round icon={call.muted ? 'mic-off' : 'mic'} label={call.muted ? 'Unmute' : 'Mute'} on={call.muted} onPress={toggleMute} />
              <Round icon="volume-high" label="Speaker" on={call.speaker} onPress={toggleSpeaker} />
              {call.video && <Round icon={call.camOff ? 'videocam-off' : 'videocam'} label="Camera" on={call.camOff} onPress={toggleCamera} />}
              {call.video && <Round icon="camera-reverse" label="Flip" onPress={flipCamera} />}
            </View>
            <View style={{ alignItems: 'center' }}>
              <Round icon="call" label="End" color="#FF3B5C" size={72} hang onPress={hangUp} />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
