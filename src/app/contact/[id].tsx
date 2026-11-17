import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image } from 'expo-image';
import { Linking, Pressable, Switch, Text, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { Avatar, useRing } from '../../components/Avatar';
import { openFile } from '../../components/Media';
import { WALLS } from '../../components/Wallpaper';
import { ask, Card, Chip, Chips, confirm, Header, Row, Screen, Section, Sheet, tap, toast } from '../../components/ui';
import { useMe } from '../../lib/boot';
import * as core from '../../lib/core';
import { safetyNumber, unb64 } from '../../lib/crypto';
import { useLive } from '../../lib/db';
import { firstUrl } from '../../lib/links';
import { plain } from '../../lib/md';
import { usePeer } from '../../lib/relay';
import { bytes, lastSeen, listTime, TTLS, ttlLabel } from '../../lib/time';
import { PRESETS, presetTheme, useT, type Preset } from '../../lib/theme';

export default function ContactInfo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const c = useLive(() => core.contact(id), id, id);
  const stars = useLive(() => core.starred(id), id, id);
  const media = useLive(() => core.media(id), id, id);
  const links = useLive(() => core.links(id), id, id);
  const myPub = useMe((m) => m.pub);
  const peer = usePeer(id);
  const ring = useRing(id);
  const [timer, setTimer] = useState(false);
  const [safety, setSafety] = useState(false);
  if (!c) return <Screen>{null}</Screen>;
  const number = safetyNumber(unb64(myPub), unb64(c.pub));
  const self = core.isSelf(id);
  const photos = media.filter((m) => m.kind === 'image' && core.metaOf(m).local);
  const files = media.filter((m) => m.kind === 'file');

  return (
    <Screen scroll>
      <Header title="" back />
      <Animated.View entering={FadeInDown.duration(350).easing(Easing.out(Easing.cubic))} style={{ alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Avatar seed={c.pub} label={c.label} size={108} online={peer.online} self={self} ring={self ? null : ring} story={id} />
        <Pressable
          disabled={self}
          onPress={() => ask('Rename', 'Only you see this name.', 'Save', (v) => v.trim() && core.rename(id, v.trim()), { placeholder: c.label })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: t.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.8 }}>{c.label}</Text>
            {!self && <Ionicons name="pencil" size={16} color={t.sub} />}
          </View>
        </Pressable>
        <Text style={{ color: peer.online ? t.accent : t.sub, fontWeight: '600' }}>
          {self ? 'Only on this phone' : peer.online ? 'online' : peer.seen ? lastSeen(peer.seen) : c.state === 'blocked' ? 'blocked' : 'connected'}
        </Text>
      </Animated.View>

      {(photos.length > 0 || files.length > 0 || links.length > 0) && (
        <>
          <Section title={`Media, files and links · ${media.length + links.length}`} />
          <Card style={{ gap: 12 }}>
            {photos.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {photos.slice(0, 9).map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() => router.push(`/media/${m.id}`)}
                    style={{ width: '31.8%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden' }}
                  >
                    <Image source={{ uri: core.metaOf(m).local }} contentFit="cover" style={{ flex: 1 }} />
                  </Pressable>
                ))}
              </View>
            )}
            {files.slice(0, 5).map((m) => {
              const x = core.metaOf(m);
              return (
                <Pressable key={m.id} onPress={() => x.local && openFile(x.local, x.mime)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Ionicons name="document-text-outline" size={22} color={t.accent} />
                  <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontWeight: '600' }}>
                    {x.name}
                  </Text>
                  <Text style={{ color: t.dim, fontSize: 12.5 }}>{bytes(x.size ?? 0)}</Text>
                </Pressable>
              );
            })}
            {links.slice(0, 5).map((m) => {
              const url = core.metaOf(m).link?.url ?? firstUrl(m.body);
              return url ? (
                <Pressable key={m.id} onPress={() => Linking.openURL(url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Ionicons name="link-outline" size={22} color={t.accent} />
                  <Text numberOfLines={1} style={{ flex: 1, color: t.text }}>
                    {core.metaOf(m).link?.title ?? url}
                  </Text>
                </Pressable>
              ) : null;
            })}
          </Card>
        </>
      )}

      <Section title="Chat" />
      <Card>
        {!self && <Row icon="timer-outline" title="Disappearing messages" sub={ttlLabel(c.ttl)} onPress={() => setTimer(true)} />}
        {!self && (
          <Row
            icon="shield-checkmark-outline"
            iconColor={t.green}
            title="Safety number"
            sub="Confirm no one is in the middle"
            onPress={() => setSafety(true)}
          />
        )}
        <Row
          icon="eye-off-outline"
          title="Block screenshots"
          sub="In this chat, on this phone"
          right={
            <Switch
              value={!!c.shots}
              onValueChange={(v) => (tap(), core.setChatLook(id, { shots: v ? 1 : 0 }))}
              trackColor={{ true: t.accent, false: t.surface2 }}
              thumbColor="#fff"
            />
          }
        />
      </Card>

      <Section title="Chat colour" />
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {([null, ...Object.keys(PRESETS)] as (Preset | null)[]).map((k) => {
            const g = k ? presetTheme(k).grad : [t.surface2, t.surface2];
            const on = (c.theme ?? null) === k;
            return (
              <Pressable
                key={k ?? 'default'}
                onPress={() => (tap(), core.setChatLook(id, { theme: k }))}
                accessibilityLabel={k ? PRESETS[k].name : 'App default'}
              >
                <View style={{ width: 44, height: 44, borderRadius: 22, padding: 3, borderWidth: 2, borderColor: on ? t.text : 'transparent' }}>
                  <LinearGradient
                    colors={g as [string, string]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ flex: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}
                  >
                    {!k && <Ionicons name="color-palette-outline" size={16} color={t.sub} />}
                  </LinearGradient>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Chips>
          {WALLS.map(([k, label]) => (
            <Chip key={k} label={label} active={(c.wall ?? 'none') === k} onPress={() => core.setChatLook(id, { wall: k })} />
          ))}
        </Chips>
      </Card>

      {stars.length > 0 && (
        <>
          <Section title={`Starred · ${stars.length}`} />
          <Card style={{ paddingVertical: 4 }}>
            {stars.slice(0, 20).map((m) => (
              <Pressable
                key={m.id}
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id, jump: m.id } })}
                style={({ pressed }) => ({ paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}
              >
                <View style={{ flexDirection: 'row' }}>
                  <Text style={{ flex: 1, color: t.text, fontWeight: '700' }}>{m.mine ? 'You' : c.label}</Text>
                  <Text style={{ color: t.dim, fontSize: 12.5 }}>{listTime(m.ts)}</Text>
                </View>
                <Text numberOfLines={2} style={{ color: t.sub, marginTop: 2 }}>
                  {plain(m.body)}
                </Text>
              </Pressable>
            ))}
          </Card>
        </>
      )}

      <Section title="Manage" />
      <Card>
        <Row
          icon="brush-outline"
          title="Clear chat"
          onPress={() => confirm('Clear this chat?', 'Messages are removed from this phone only.', 'Clear', () => core.clearChat(id), true)}
        />
        {self ? null : c.state === 'blocked' ? (
          <Row icon="hand-left-outline" title="Unblock" onPress={() => (core.unblock(id), toast('Unblocked'))} />
        ) : (
          <Row
            icon="hand-left-outline"
            title="Block"
            danger
            onPress={() => confirm(`Block ${c.label}?`, 'You won’t receive their messages.', 'Block', () => core.block(id), true)}
          />
        )}
        {!self && (
          <Row
            icon="trash-outline"
            title="Delete contact"
            danger
            onPress={() =>
              confirm(
                'Delete contact and chat?',
                'You will need their code to connect again.',
                'Delete',
                () => {
                  core.removeContact(id);
                  router.dismissTo('/');
                },
                true,
              )
            }
          />
        )}
      </Card>

      <Sheet visible={timer} onClose={() => setTimer(false)} title="Disappearing messages">
        {TTLS.map(([s, label]) => (
          <Pressable
            key={s}
            onPress={() => {
              tap();
              setTimer(false);
              if (s !== c.ttl) core.setTtl(id, s);
            }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: '600' }}>{label}</Text>
            {c.ttl === s && <Ionicons name="checkmark-circle" size={22} color={t.accent} />}
          </Pressable>
        ))}
      </Sheet>

      <Sheet visible={safety} onClose={() => setSafety(false)} title="Safety number">
        <Text style={{ color: t.sub, fontSize: 14, lineHeight: 20, marginBottom: 14 }}>
          Compare these numbers with {c.label}, in person or on a call. If they match on both phones, your chat is private.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', paddingVertical: 8 }}>
          {number.split(' ').map((n, i) => (
            <Text key={i} style={{ color: t.text, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'], width: '28%', textAlign: 'center' }}>
              {n}
            </Text>
          ))}
        </View>
      </Sheet>
    </Screen>
  );
}
