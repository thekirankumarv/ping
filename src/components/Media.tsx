import { Ionicons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import * as core from '../lib/core';
import { embed, firstUrl } from '../lib/links';
import { retry } from '../lib/media';
import { bytes, duration } from '../lib/time';
import { useT } from '../lib/theme';
import { cycleRate, seek, toggle, useVoice } from '../lib/voice';
import { notify, tap } from './ui';

// hold: inner Pressables take the touch, so they pass long-press on to open the message menu.
export type Ink = { fg: string; sub: string; strong: string; on: boolean; hold?: () => void };

const thumbUri = (b?: string) => (b ? `data:image/jpeg;base64,${b}` : undefined);

export async function openFile(local: string, mime?: string) {
  const f = new File(local);
  try {
    await f.preview();
  } catch {
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(local, { mimeType: mime });
    else notify('No app can open this file');
  }
}

function Pending({ m, ink }: { m: core.Msg; ink: Ink }) {
  const x = core.metaOf(m);
  if (m.mine && x.failed)
    return (
      <Pressable
        onLongPress={ink.hold}
        delayLongPress={260}
        onPress={() => (tap(), retry(m.id))}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        hitSlop={8}
      >
        <Ionicons name="refresh-circle" size={22} color={ink.strong} />
        <Text style={{ color: ink.strong, fontWeight: '800', fontSize: 13 }}>Retry</Text>
      </Pressable>
    );
  if ((m.mine && m.status === 0) || (!m.mine && x.path)) return <ActivityIndicator size="small" color={ink.fg} />;
  return null;
}

export function ImageBody({ m, ink, width }: { m: core.Msg; ink: Ink; width: number }) {
  const t = useT();
  const x = core.metaOf(m);
  const ratio = x.w && x.h ? x.h / x.w : 0.75;
  const h = Math.max(120, Math.min(width * ratio, 360));
  const busy = (m.mine && (m.status === 0 || x.failed)) || (!m.mine && !!x.path);
  const missing = x.cleared || (!x.local && !busy);
  return (
    <Pressable
      onLongPress={ink.hold}
      delayLongPress={260}
      onPress={() => x.local && router.push(`/media/${m.id}`)}
      style={{ width, height: h, borderRadius: 16, overflow: 'hidden', backgroundColor: t.surface2 }}
    >
      {missing ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Ionicons name="image-outline" size={28} color={t.dim} />
          <Text style={{ color: t.dim, fontSize: 12.5 }}>{x.cleared ? 'Removed to save space' : 'Not on this phone'}</Text>
        </View>
      ) : (
        <Image
          source={x.local ? { uri: x.local } : undefined}
          placeholder={thumbUri(x.thumb) ? { uri: thumbUri(x.thumb) } : undefined}
          placeholderContentFit="cover"
          contentFit="cover"
          transition={180}
          blurRadius={x.local ? 0 : 12}
          style={{ flex: 1 }}
        />
      )}
      {busy && (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 24, padding: 10 }}>
            <Pending m={m} ink={{ ...ink, fg: '#fff', strong: '#fff' }} />
          </View>
        </View>
      )}
    </Pressable>
  );
}

export function OnceBody({ m, ink }: { m: core.Msg; ink: Ink }) {
  const x = core.metaOf(m);
  const label = x.opened ? 'Opened' : m.mine ? 'Photo' : x.local ? 'Tap to view' : 'Photo';
  return (
    <Pressable
      onLongPress={ink.hold}
      delayLongPress={260}
      disabled={m.mine === 1 || !x.local || x.opened}
      onPress={() => router.push(`/media/${m.id}`)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, paddingRight: 6 }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          borderWidth: 2,
          borderStyle: x.opened ? 'dashed' : 'solid',
          borderColor: ink.strong,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: ink.strong, fontWeight: '900', fontSize: 13 }}>1</Text>
      </View>
      <Text style={{ color: x.opened ? ink.sub : ink.fg, fontSize: 15, fontWeight: '700', fontStyle: x.opened ? 'italic' : 'normal' }}>{label}</Text>
      <Pending m={m} ink={ink} />
    </Pressable>
  );
}

export function FileBody({ m, ink }: { m: core.Msg; ink: Ink }) {
  const x = core.metaOf(m);
  const ext = (x.name?.split('.').pop() ?? 'file').slice(0, 4).toUpperCase();
  return (
    <Pressable
      onLongPress={ink.hold}
      delayLongPress={260}
      onPress={() => x.local && openFile(x.local, x.mime)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4, minWidth: 220 }}
    >
      <View
        style={{
          width: 44,
          height: 50,
          borderRadius: 10,
          backgroundColor: ink.on ? 'rgba(0,0,0,0.14)' : ink.strong + '22',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="document-text" size={22} color={ink.strong} />
        <Text style={{ color: ink.strong, fontSize: 8.5, fontWeight: '900', marginTop: 1 }}>{ext}</Text>
      </View>
      <View style={{ flexShrink: 1, gap: 2 }}>
        <Text numberOfLines={2} style={{ color: ink.fg, fontSize: 15, fontWeight: '700' }}>
          {x.name ?? 'File'}
        </Text>
        <Text style={{ color: ink.sub, fontSize: 12.5 }}>
          {x.cleared ? 'Removed to save space' : !x.local && !x.path && !m.mine ? 'Not on this phone' : bytes(x.size ?? 0)}
        </Text>
      </View>
      <Pending m={m} ink={ink} />
    </Pressable>
  );
}

export function VoiceBody({ m, ink }: { m: core.Msg; ink: Ink }) {
  const x = core.metaOf(m);
  const me = useVoice((v) => v.id === m.id);
  const playing = useVoice((v) => v.id === m.id && v.playing);
  const pos = useVoice((v) => (v.id === m.id ? v.pos : 0));
  const rate = useVoice((v) => v.rate);
  const dur = x.dur ?? 0;
  const wave = x.wave?.length ? x.wave : Array.from({ length: 36 }, () => 0.3);
  const done = dur ? pos / dur : 0;
  const ready = !!x.local;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: 236, paddingVertical: 2 }}>
      <Pressable
        onLongPress={ink.hold}
        delayLongPress={260}
        disabled={!ready}
        onPress={() => x.local && toggle(m.id, x.local)}
        accessibilityLabel={playing ? 'Pause' : 'Play'}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: ink.on ? 'rgba(0,0,0,0.16)' : ink.strong,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {ready ? (
          <Ionicons name={playing ? 'pause' : 'play'} size={19} color={ink.on ? ink.fg : '#07080C'} style={{ marginLeft: playing ? 0 : 2 }} />
        ) : (
          <Pending m={m} ink={{ ...ink, fg: ink.on ? ink.fg : '#07080C' }} />
        )}
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <Pressable
          onLongPress={ink.hold}
          delayLongPress={260}
          onPress={(e) => dur && seek(m.id, Math.max(0, Math.min(1, e.nativeEvent.locationX / 170)) * dur)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 28 }}
        >
          {wave.map((v, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: Math.max(3, v * 26),
                borderRadius: 2,
                backgroundColor: i / wave.length < done ? ink.strong : ink.on ? 'rgba(0,0,0,0.25)' : ink.sub + '77',
              }}
            />
          ))}
        </Pressable>
        <Text style={{ color: ink.sub, fontSize: 11.5, fontVariant: ['tabular-nums'] }}>{duration(me ? pos : dur)}</Text>
      </View>
      {me && (
        <Pressable
          onLongPress={ink.hold}
          delayLongPress={260}
          onPress={cycleRate}
          hitSlop={6}
          style={{ borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: ink.on ? 'rgba(0,0,0,0.16)' : ink.strong + '26' }}
        >
          <Text style={{ color: ink.on ? ink.fg : ink.strong, fontSize: 12, fontWeight: '900' }}>{rate}×</Text>
        </Pressable>
      )}
    </View>
  );
}

// Shorts have a vertical thumbnail; older uploads only have the 4:3 one.
function YtThumb({ id, tall }: { id: string; tall: boolean }) {
  const [wide, setWide] = useState(!tall);
  return (
    <Image
      source={{ uri: `https://i.ytimg.com/vi/${id}/${wide ? 'hqdefault' : 'oardefault'}.jpg` }}
      onError={() => setWide(true)}
      contentFit="cover"
      style={{ flex: 1 }}
    />
  );
}

// Video and link cards under a text message.
export function LinkCard({ m, ink, width }: { m: core.Msg; ink: Ink; width: number }) {
  const t = useT();
  const link = core.metaOf(m).link;
  const url = link?.url ?? firstUrl(m.body);
  if (!url) return null;
  const e = embed(url);
  const card = { marginTop: 6, borderRadius: 14, overflow: 'hidden' as const, backgroundColor: ink.on ? 'rgba(0,0,0,0.14)' : t.surface, width };
  const meta = (title?: string, site?: string) => (
    <View style={{ padding: 10, gap: 2 }}>
      {!!site && (
        <Text numberOfLines={1} style={{ color: ink.strong, fontSize: 11.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {site}
        </Text>
      )}
      {!!title && (
        <Text numberOfLines={2} style={{ color: ink.fg, fontSize: 14, fontWeight: '700' }}>
          {title}
        </Text>
      )}
    </View>
  );

  if (e?.type === 'youtube')
    return (
      <Pressable onLongPress={ink.hold} delayLongPress={260} onPress={() => router.push({ pathname: '/play', params: { url } })} style={card}>
        <View style={{ height: e.tall ? width * 1.15 : (width * 9) / 16, backgroundColor: '#000' }}>
          <YtThumb id={e.id} tall={e.tall} />
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 58, height: 40, borderRadius: 12, backgroundColor: '#FF0033', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="play" size={22} color="#fff" style={{ marginLeft: 2 }} />
            </View>
          </View>
          {e.tall && (
            <View
              style={{ position: 'absolute', left: 8, top: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}
            >
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>SHORTS</Text>
            </View>
          )}
        </View>
        {meta(link?.title, link?.site ?? 'YouTube')}
      </Pressable>
    );

  if (e?.type === 'instagram')
    return (
      <Pressable onLongPress={ink.hold} delayLongPress={260} onPress={() => router.push({ pathname: '/play', params: { url } })} style={card}>
        <LinearGradient
          colors={['#FEDA75', '#D62976', '#4F5BD5']}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 120, alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Ionicons name="logo-instagram" size={34} color="#fff" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="play-circle" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800' }}>Play {e.kind === 'p' ? 'post' : e.kind}</Text>
          </View>
        </LinearGradient>
        {meta(link?.title, 'Instagram')}
      </Pressable>
    );

  if (!link?.title && !link?.thumb) return null;
  return (
    <Pressable onLongPress={ink.hold} delayLongPress={260} onPress={() => Linking.openURL(url)} style={card}>
      {!!link.thumb && <Image source={{ uri: thumbUri(link.thumb) }} contentFit="cover" style={{ height: width * 0.5 }} />}
      {meta(link.title, link.site)}
      {!!link.desc && (
        <Text numberOfLines={2} style={{ color: ink.sub, fontSize: 12.5, paddingHorizontal: 10, paddingBottom: 10, marginTop: -6 }}>
          {link.desc}
        </Text>
      )}
    </Pressable>
  );
}
