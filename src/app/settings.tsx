import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, Switch, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { Bubble } from '../components/Bubble';
import { Mark } from '../components/Mark';
import { ask, busy, Card, choose, confirm, Header, notify, Row, Screen, Section, Seg, tap, toast } from '../components/ui';
import { lockSupported, setAppLock, useAppLock } from '../lib/applock';
import { makeBackup, saveBackup, shareBackup } from '../lib/backup';
import { useMe, wipeEverything } from '../lib/boot';
import * as core from '../lib/core';
import { useLive } from '../lib/db';
import { gc } from '../lib/media';
import { setPrivacy, usePrivacy } from '../lib/privacy';
import { applyPrivacy } from '../lib/relay';
import { bytes } from '../lib/time';
import { DISPLAY, DISPLAY_MED, PRESETS, presetTheme, setLook, useLook, useT, type Bubble as BubbleStyle, type Mode, type Preset } from '../lib/theme';

const now = Date.now();
const sample = (id: string, mine: 0 | 1, body: string, extra: Partial<core.Msg> = {}): core.Msg => ({
  id,
  chat: '',
  mine,
  kind: 'text',
  body,
  reply: null,
  status: 3,
  edited: null,
  ttl: 0,
  exp: null,
  ts: now,
  gone: 0,
  reacts: '{}',
  star: 0,
  meta: null,
  once: 0,
  pin: 0,
  ...extra,
});
const PREVIEW = [sample('a', 0, 'Did you push the fix? 👀'), sample('b', 1, 'Yes, **deployed**.\n- [x] tests\n- [ ] changelog', { reacts: '{"x":"🔥"}' })];
const noop = () => {};

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const t = useT();
  return <Switch value={value} onValueChange={(v) => (tap(), onChange(v))} trackColor={{ true: t.accent, false: t.surface2 }} thumbColor="#fff" />;
}

export default function Settings() {
  const t = useT();
  const look = useLook();
  const privacy = usePrivacy();
  const lock = useAppLock((s) => s.on);
  const code = useMe((m) => m.code);
  const blocked = useLive(core.blocked, '');
  const usage = useLive(() => [...core.usage()].sort((a, b) => b[1].bytes - a[1].bytes), '');
  const total = usage.reduce((n, [, u]) => n + u.bytes, 0);

  return (
    <Screen scroll>
      <Header title="Settings" back />

      <Pressable onPress={() => router.push('/add')} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
        <LinearGradient
          colors={t.grad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 24, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}
        >
          <View style={{ width: 50, height: 50, borderRadius: 17, backgroundColor: t.onAccent + '1F', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="qr-code" size={24} color={t.onAccent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.onAccentSub, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 }}>YOUR CODE</Text>
            <Text style={{ color: t.onAccent, fontSize: 26, fontFamily: DISPLAY, letterSpacing: 3 }}>{`${code.slice(0, 4)} ${code.slice(4)}`}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={t.onAccent} />
        </LinearGradient>
      </Pressable>

      <Section title="Appearance" />
      <Card style={{ gap: 16 }}>
        <View style={{ backgroundColor: t.bg, borderRadius: 18, paddingVertical: 10, borderWidth: 1, borderColor: t.line }} pointerEvents="none">
          {PREVIEW.map((m) => (
            <Bubble
              key={m.id}
              m={m}
              joinTop={false}
              joinBottom={false}
              quotedName=""
              flash={false}
              fresh={false}
              scheduled={false}
              now={now}
              onReply={noop}
              onMenu={noop}
              onJump={noop}
              onToggle={noop}
            />
          ))}
        </View>
        <Seg<Mode>
          options={[
            ['system', 'Auto'],
            ['dark', 'Dark'],
            ['amoled', 'Black'],
            ['light', 'Light'],
          ]}
          value={look.mode}
          onChange={(mode) => setLook({ mode })}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {(Object.keys(PRESETS) as Preset[]).map((k) => {
            const on = look.preset === k;
            const pt = { name: PRESETS[k].name, grad: presetTheme(k).grad };
            return (
              <Pressable
                key={k}
                onPress={() => (tap(), setLook({ preset: k }))}
                accessibilityLabel={`${pt.name} theme`}
                style={({ pressed }) => ({
                  width: '31%',
                  flexGrow: 1,
                  borderRadius: 18,
                  padding: 12,
                  gap: 10,
                  backgroundColor: t.surface2,
                  borderWidth: 2,
                  borderColor: on ? pt.grad[0] : 'transparent',
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Mark size={26} colors={[pt.grad[0], pt.grad[1]]} />
                  {on && (
                    <Animated.View entering={ZoomIn.duration(180)}>
                      <Ionicons name="checkmark-circle" size={20} color={pt.grad[0]} />
                    </Animated.View>
                  )}
                </View>
                <LinearGradient colors={[pt.grad[0], pt.grad[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 6, borderRadius: 3 }} />
                <Text style={{ color: t.text, fontFamily: DISPLAY_MED, fontSize: 14 }}>{pt.name}</Text>
              </Pressable>
            );
          })}
        </View>
        <Seg<BubbleStyle>
          options={[
            ['round', 'Round'],
            ['square', 'Square'],
            ['minimal', 'Minimal'],
          ]}
          value={look.bubble}
          onChange={(bubble) => setLook({ bubble })}
        />
        <Seg<string>
          options={[
            ['0.9', 'Small'],
            ['1', 'Default'],
            ['1.1', 'Large'],
            ['1.2', 'Huge'],
          ]}
          value={String(look.font)}
          onChange={(f) => setLook({ font: Number(f) })}
        />
      </Card>

      <Section title="Privacy" />
      <Card>
        {lockSupported && (
          <Row
            icon="finger-print"
            title="App lock"
            sub="Fingerprint or screen lock after 1 minute away"
            right={
              <Toggle
                value={lock}
                onChange={async (v) => {
                  const r = await setAppLock(v);
                  if (r === 'none') notify('No screen lock set', 'Add a fingerprint or PIN in your phone settings first.');
                }}
              />
            }
          />
        )}
        <Row
          icon="eye-off-outline"
          title="Hide online and last seen"
          sub="Others won’t see when you’re online"
          right={
            <Toggle
              value={privacy.hideOnline}
              onChange={(v) => {
                setPrivacy({ hideOnline: v });
                applyPrivacy();
              }}
            />
          }
        />
        <Row
          icon="phone-portrait-outline"
          title="Block screenshots"
          sub="Also hides PING in recent apps"
          right={<Toggle value={privacy.noScreenshots} onChange={(v) => setPrivacy({ noScreenshots: v })} />}
        />
      </Card>

      {blocked.length > 0 && (
        <>
          <Section title="Blocked" />
          <Card>
            {blocked.map((c) => (
              <Row
                key={c.id}
                icon="hand-left-outline"
                iconColor={t.sub}
                title={c.label}
                sub="Tap to unblock"
                onPress={() => (core.unblock(c.id), toast('Unblocked'))}
              />
            ))}
          </Card>
        </>
      )}

      <Section title="Storage" right={<Text style={{ color: t.sub, fontWeight: '700' }}>{bytes(total)}</Text>} />
      <Card>
        {usage.length ? (
          usage.map(([chat, u]) => (
            <Row
              key={chat}
              icon="folder-outline"
              title={core.contact(chat)?.label ?? 'Chat'}
              sub={`${u.count} ${u.count === 1 ? 'item' : 'items'} · ${bytes(u.bytes)}`}
              onPress={() =>
                confirm('Free up space?', 'Photos, voice messages and files in this chat are removed from this phone. Messages stay.', 'Remove', () => {
                  core.clearMedia(chat);
                  gc();
                  toast('Space freed');
                })
              }
            />
          ))
        ) : (
          <Row icon="folder-outline" title="No media stored" sub="Photos, voice messages and files show here" />
        )}
      </Card>

      <Section title="Backup" />
      <Card>
        <Row
          icon="cloud-download-outline"
          title="Export encrypted backup"
          sub="Chats, contacts and identity, password-locked. No photos or files."
          onPress={() =>
            ask(
              'Backup password',
              'You need this password to restore. It can’t be recovered.',
              'Export',
              (pw) => {
                if (pw.length < 10) return notify('Password too short', 'Use at least 10 characters. A short phrase is easiest to remember.');
                busy('Encrypting backup…', () => makeBackup(pw))
                  .then((b) =>
                    choose(
                      'Backup ready',
                      'Keep it somewhere safe, off this phone too. You need it and the password to restore.',
                      [
                        'Save to phone',
                        () =>
                          saveBackup(b)
                            .then(() => toast('Backup saved'))
                            .catch(() => {}),
                      ],
                      ['Share', () => shareBackup(b).catch(() => {})],
                    ),
                  )
                  .catch(() => notify('Backup failed', 'Please try again.'));
              },
              { secure: true, placeholder: 'A phrase, 10+ characters' },
            )
          }
        />
      </Card>

      <Section title="Danger zone" />
      <Card>
        <Row
          icon="nuclear-outline"
          title="Erase everything"
          sub="Deletes all chats, your keys and your code"
          danger
          onPress={() =>
            confirm(
              'Erase everything?',
              'All chats, contacts and your identity are deleted from this phone and the relay. This cannot be undone.',
              'Erase',
              async () => {
                await wipeEverything();
                notify('Erased', 'Close and reopen PING to start fresh.');
              },
              true,
            )
          }
        />
      </Card>

      <View style={{ alignItems: 'center', gap: 6, marginTop: 30 }}>
        <Ionicons name="lock-closed" size={16} color={t.dim} />
        <Text style={{ color: t.dim, fontSize: 12.5 }}>PING {Constants.expoConfig?.version} · end-to-end encrypted</Text>
      </View>
    </Screen>
  );
}
