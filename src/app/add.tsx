import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Share, Text, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { ask, Btn, confirm, copy, haptic, IconBtn, notify, Seg, toast } from '../components/ui';
import { newCode, useMe } from '../lib/boot';
import * as core from '../lib/core';
import { isCode } from '../lib/crypto';
import { findCode } from '../lib/relay';
import { DISPLAY, useT } from '../lib/theme';

const ease = Easing.out(Easing.cubic);
// https so messaging apps make it tappable; the page at docs/index.html opens the app.
const link = (code: string) => `https://thekirankumarv.github.io/ping/?code=${code}`;
const pretty = (code: string) => `${code.slice(0, 4)} ${code.slice(4)}`;
// Accepts a bare code, "ABCD EFGH", or a share link (https or ping://).
const extract = (s: string) => {
  const m = /code=([A-Za-z0-9]{8})/.exec(s);
  const c = (m?.[1] ?? s).replace(/[\s-]/g, '').toUpperCase();
  return isCode(c) ? c : null;
};

let connecting = false;
async function connect(code: string, setBusy: (b: boolean) => void) {
  const me = useMe.getState();
  if (code === me.code) return notify('That’s your own code', 'Share it with someone, or scan theirs.');
  if (connecting) return;
  connecting = true;
  setBusy(true);
  try {
    const hit = await findCode(code);
    if (!hit) return notify('No one has that code', 'Check the code, or ask them for a fresh one.');
    const known = core.contact(hit.id);
    if (known?.state === 'ok') return router.replace(`/chat/${hit.id}`);
    ask('Name this contact', 'Only you see this name.', 'Connect', (v) => {
      const r = core.addContact(hit.id, hit.pub, v.trim() || 'Friend');
      haptic.ok();
      toast(r === 'connected' ? 'Connected' : 'Request sent', 'paper-plane');
      router.replace(`/chat/${hit.id}`);
    });
  } catch {
    notify('Couldn’t look that up', 'Check your internet connection and try again.');
  } finally {
    connecting = false;
    setBusy(false);
  }
}

function MyCode() {
  const t = useT();
  const code = useMe((m) => m.code);
  return (
    <Animated.View entering={FadeIn.duration(250)} style={{ alignItems: 'center', gap: 22, paddingTop: 12 }}>
      <View style={{ padding: 22, borderRadius: 32, backgroundColor: '#fff', shadowColor: t.grad[0], shadowOpacity: 0.35, shadowRadius: 30, elevation: 10 }}>
        <QRCode value={link(code)} size={220} color="#0B0D12" backgroundColor="#fff" ecl="M" />
      </View>
      <Pressable onPress={() => copy(code, 'Code')} style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ color: t.text, fontSize: 36, fontFamily: DISPLAY, letterSpacing: 5 }}>{pretty(code)}</Text>
        <Text style={{ color: t.sub, fontSize: 13 }}>Tap to copy</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
        <View style={{ flex: 1 }}>
          <Btn label="Share" icon="share-outline" onPress={() => Share.share({ message: `Chat with me on PING. My code: ${pretty(code)}\n${link(code)}` })} />
        </View>
        <View style={{ flex: 1 }}>
          <Btn
            label="New code"
            icon="refresh"
            kind="ghost"
            onPress={() =>
              confirm('Get a new code?', 'Your old code and QR stop working. People already connected stay connected.', 'New code', () =>
                newCode()
                  .then(() => toast('New code ready'))
                  .catch(() => notify('Couldn’t change code', 'Check your internet connection.')),
              )
            }
          />
        </View>
      </View>
      <Text style={{ color: t.dim, fontSize: 12.5, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 }}>
        Anyone with this code can send you a request. You choose who to accept.
      </Text>
    </Animated.View>
  );
}

function Scan({ setBusy }: { setBusy: (b: boolean) => void }) {
  const t = useT();
  const [perm, request] = useCameraPermissions();
  const done = useRef(false);
  if (!perm) return null;
  if (!perm.granted)
    return (
      <View style={{ alignItems: 'center', gap: 16, paddingTop: 50 }}>
        <Ionicons name="camera-outline" size={44} color={t.sub} />
        <Text style={{ color: t.sub, textAlign: 'center' }}>Camera access is needed to scan a PING code.</Text>
        <Btn label="Allow camera" onPress={request} />
      </View>
    );
  return (
    <Animated.View entering={FadeIn.duration(250)} style={{ alignItems: 'center', gap: 18, paddingTop: 12 }}>
      <View style={{ width: 280, height: 280, borderRadius: 32, overflow: 'hidden', borderWidth: 3, borderColor: t.accent }}>
        <CameraView
          style={{ flex: 1 }}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            const code = extract(data);
            if (!code || done.current) return;
            done.current = true;
            haptic.ok();
            connect(code, setBusy).finally(() => setTimeout(() => (done.current = false), 1500));
          }}
        />
      </View>
      <Text style={{ color: t.sub }}>Point at their PING QR code</Text>
    </Animated.View>
  );
}

function Enter({ setBusy }: { setBusy: (b: boolean) => void }) {
  const t = useT();
  const [v, setV] = useState('');
  const code = extract(v);
  return (
    <Animated.View entering={FadeIn.duration(250)} style={{ gap: 18, paddingTop: 30 }}>
      <TextInput
        autoFocus
        value={v}
        onChangeText={(s) => setV(s.toUpperCase().replace(/[^A-Z0-9:/?=\s-]/g, ''))}
        placeholder="ABCD EFGH"
        placeholderTextColor={t.dim}
        autoCapitalize="characters"
        autoCorrect={false}
        selectionColor={t.accent}
        onSubmitEditing={() => code && connect(code, setBusy)}
        style={{
          color: t.text,
          fontSize: 30,
          fontFamily: DISPLAY,
          letterSpacing: 5,
          textAlign: 'center',
          backgroundColor: t.surface,
          borderRadius: 22,
          height: 76,
          borderWidth: 1.5,
          borderColor: code ? t.accent : t.line,
        }}
      />
      <Btn label="Connect" icon="paper-plane" disabled={!code} onPress={() => code && connect(code, setBusy)} />
    </Animated.View>
  );
}

export default function Add() {
  const t = useT();
  const ins = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string }>();
  const [tab, setTab] = useState<'mine' | 'scan' | 'enter'>('mine');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = params.code && extract(params.code);
    if (c) connect(c, setBusy);
  }, [params.code]);
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: ins.top + 8, paddingHorizontal: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
        <Text style={{ flex: 1, color: t.text, fontSize: 30, fontFamily: DISPLAY, letterSpacing: -1 }}>Connect</Text>
        <IconBtn name="close" label="Close" onPress={() => router.back()} />
      </View>
      <Animated.View entering={FadeInDown.duration(300).easing(ease)}>
        <Seg
          options={[
            ['mine', 'My code'],
            ['scan', 'Scan'],
            ['enter', 'Enter code'],
          ]}
          value={tab}
          onChange={setTab}
        />
      </Animated.View>
      {tab === 'mine' ? <MyCode /> : tab === 'scan' ? <Scan setBusy={setBusy} /> : <Enter setBusy={setBusy} />}
      {busy && <ActivityIndicator color={t.accent} style={{ marginTop: 24 }} />}
    </View>
  );
}
