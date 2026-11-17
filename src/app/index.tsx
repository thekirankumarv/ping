import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { memo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, LinearTransition, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, useRing } from '../components/Avatar';
import { TypingDots } from '../components/Typing';
import { ask, Btn, confirm, Empty, haptic, IconBtn, Sheet, tap } from '../components/ui';
import * as core from '../lib/core';
import { useLive } from '../lib/db';
import { plain } from '../lib/md';
import { usePeer, useNet } from '../lib/relay';
import { listTime } from '../lib/time';
import { DISPLAY, useT } from '../lib/theme';
import { LinearGradient } from 'expo-linear-gradient';

const ease = Easing.out(Easing.cubic);

const ChatRow = memo(function ChatRow({ c, onMenu }: { c: core.ChatRow; onMenu: (c: core.ChatRow) => void }) {
  const t = useT();
  const peer = usePeer(c.id);
  const ring = useRing(c.id);
  const m = c.last;
  const preview = !m
    ? c.state === 'out'
      ? 'Waiting for them to accept'
      : c.id === core.myId()
        ? 'Notes, links and files for yourself'
        : 'Say hi 👋'
    : m.kind === 'sys' || m.kind === 'call'
      ? m.body
      : `${m.mine && !m.gone && c.id !== core.myId() ? 'You: ' : ''}${core.summary(m)}`;
  const tick =
    m?.mine && !m.gone && m.kind !== 'call' && c.id !== core.myId()
      ? m.status === 0
        ? 'time-outline'
        : m.status === 1
          ? 'checkmark'
          : 'checkmark-done'
      : null;
  return (
    <Pressable
      onPress={() => router.push(`/chat/${c.id}`)}
      onLongPress={() => (haptic.medium(), onMenu(c))}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 18,
        paddingVertical: 11,
        backgroundColor: pressed ? t.surface : 'transparent',
      })}
    >
      <Avatar seed={c.pub} label={c.label} size={54} online={peer.online} self={c.id === core.myId()} ring={c.id === core.myId() ? null : ring} story={c.id} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 16.5, fontWeight: '700', letterSpacing: -0.2 }}>
            {c.label}
          </Text>
          {!!c.ttl && <Ionicons name="timer-outline" size={14} color={t.sub} />}
          <Text style={{ color: c.unread ? t.accent : t.dim, fontSize: 12.5, fontWeight: c.unread ? '700' : '500' }}>{m ? listTime(m.ts) : ''}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {peer.typing ? (
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: t.accent, fontSize: 14.5, fontWeight: '600' }}>typing</Text>
              <TypingDots color={t.accent} size={4.5} />
            </View>
          ) : (
            <>
              {tick && <Ionicons name={tick} size={16} color={m?.status === 3 ? t.accent : t.dim} />}
              <Text numberOfLines={1} style={{ flex: 1, color: t.sub, fontSize: 14.5, fontStyle: m?.gone ? 'italic' : 'normal' }}>
                {c.draft ? <Text style={{ color: t.red }}>Draft: </Text> : null}
                {c.draft ? plain(c.draft) : preview}
              </Text>
            </>
          )}
          {c.unread > 0 && (
            <Animated.View
              entering={ZoomIn.duration(200)}
              style={{
                minWidth: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: t.grad[0],
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 6,
              }}
            >
              <Text style={{ color: t.onAccent, fontSize: 12, fontWeight: '800' }}>{c.unread}</Text>
            </Animated.View>
          )}
        </View>
      </View>
    </Pressable>
  );
});

function Stories() {
  const t = useT();
  const me = core.myId();
  const live = useLive(core.activeStories, 'stories', core.STORIES);
  const mine = live.some((s) => s.author === me);
  const unseen = (id: string) => live.some((s) => s.author === id && !s.seen);
  const authors = [...new Set(live.filter((s) => s.author !== me).map((s) => s.author))].sort((a, b) => Number(unseen(b)) - Number(unseen(a)));
  const item = (key: string, label: string, avatar: React.ReactNode, onPress: () => void, onLongPress?: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({ width: 74, alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}
    >
      {avatar}
      <Text numberOfLines={1} style={{ color: t.sub, fontSize: 12.5, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 14, gap: 4 }}>
      {item(
        'me',
        mine ? 'My story' : 'Add story',
        <View>
          <Avatar seed={me} label="Me" size={64} self icon="person" ring={mine ? 'seen' : null} />
          <View style={{ position: 'absolute', right: -2, bottom: -2, borderRadius: 13, borderWidth: 3, borderColor: t.bg }}>
            <LinearGradient colors={t.grad} style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={16} color={t.onAccent} />
            </LinearGradient>
          </View>
        </View>,
        () => (tap(), router.push(mine ? { pathname: '/story/[id]', params: { id: me } } : '/story/new')),
        () => (haptic.medium(), router.push('/story/new')),
      )}
      {authors.map((id) => {
        const c = core.contact(id);
        return c
          ? item(
              id,
              c.label,
              <Avatar seed={c.pub} label={c.label} size={64} ring={unseen(id) ? 'new' : 'seen'} />,
              () => (tap(), router.push({ pathname: '/story/[id]', params: { id } })),
            )
          : null;
      })}
    </ScrollView>
  );
}

function Request({ c }: { c: core.ChatRow }) {
  const t = useT();
  return (
    <Animated.View
      entering={FadeInDown.duration(300).easing(ease)}
      exiting={FadeOut.duration(200)}
      layout={LinearTransition.duration(250)}
      style={{
        marginHorizontal: 16,
        marginBottom: 10,
        padding: 16,
        borderRadius: 22,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.line,
        gap: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar seed={c.pub} label="?" size={44} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '800' }}>New request</Text>
          <Text style={{ color: t.sub, fontSize: 13.5 }}>Wants to connect · {listTime(c.created)}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Btn small kind="ghost" label="Decline" onPress={() => confirm('Decline request?', 'They won’t be told.', 'Decline', () => core.block(c.id), true)} />
        </View>
        <View style={{ flex: 1 }}>
          <Btn
            small
            label="Accept"
            onPress={() =>
              ask('Name this contact', 'Only you see this name.', 'Accept', (v) => {
                core.accept(c.id, v.trim() || 'Friend');
                haptic.ok();
              })
            }
          />
        </View>
      </View>
    </Animated.View>
  );
}

export default function Chats() {
  const t = useT();
  const ins = useSafeAreaInsets();
  const status = useNet((s) => s.status);
  const all = useLive(core.chats, '');
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState<core.ChatRow | null>(null);
  const requests = all.filter((c) => c.state === 'in');
  const list = all.filter((c) => c.state !== 'in' && (!q || c.label.toLowerCase().includes(q.toLowerCase())));
  const hits = useLive(() => (q.trim().length > 1 ? core.search(q.trim()) : []), q);
  const label = (id: string) => all.find((c) => c.id === id)?.label ?? '';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: ins.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8, gap: 4 }}>
        {searching ? (
          <Animated.View entering={FadeIn.duration(180)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <IconBtn name="arrow-back" label="Close search" onPress={() => (setSearching(false), setQ(''))} />
            <TextInput
              autoFocus
              value={q}
              onChangeText={setQ}
              placeholder="Search chats and messages"
              placeholderTextColor={t.dim}
              selectionColor={t.accent}
              style={{ flex: 1, color: t.text, fontSize: 17, paddingVertical: 8 }}
            />
          </Animated.View>
        ) : (
          <>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 34, fontFamily: DISPLAY, letterSpacing: -1.2 }}>
                PING<Text style={{ color: t.accent }}>.</Text>
              </Text>
              {status !== 'online' && (
                <Animated.Text entering={FadeIn} style={{ color: t.sub, fontSize: 12.5, fontWeight: '600', marginTop: -2 }}>
                  {status === 'offline' ? 'Offline · messages will send when back' : 'Connecting…'}
                </Animated.Text>
              )}
            </View>
            <IconBtn name="search" label="Search" onPress={() => setSearching(true)} />
            <IconBtn name="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
          </>
        )}
      </View>

      <FlashList
        data={list}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => <ChatRow c={item} onMenu={setMenu} />}
        ListHeaderComponent={
          !q ? (
            <>
              <Stories />
              {requests.map((c) => (
                <Request key={c.id} c={c} />
              ))}
            </>
          ) : null
        }
        ListFooterComponent={
          hits.length ? (
            <View style={{ paddingTop: 10 }}>
              <Text style={{ color: t.sub, fontSize: 12.5, fontWeight: '800', letterSpacing: 1.2, paddingHorizontal: 18, paddingBottom: 6 }}>MESSAGES</Text>
              {hits.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => router.push({ pathname: '/chat/[id]', params: { id: m.chat, jump: m.id } })}
                  style={({ pressed }) => ({ paddingHorizontal: 18, paddingVertical: 10, backgroundColor: pressed ? t.surface : 'transparent' })}
                >
                  <View style={{ flexDirection: 'row' }}>
                    <Text style={{ flex: 1, color: t.text, fontWeight: '700' }}>{m.mine ? 'You' : label(m.chat)}</Text>
                    <Text style={{ color: t.dim, fontSize: 12.5 }}>{listTime(m.ts)}</Text>
                  </View>
                  <Text numberOfLines={2} style={{ color: t.sub, marginTop: 2 }}>
                    {core.summary(m)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          !requests.length && !q ? (
            <Empty
              icon="chatbubbles-outline"
              title="No chats yet"
              text="Share your code or scan someone’s QR to start a private chat."
              action={<Btn label="Connect with someone" icon="qr-code-outline" onPress={() => router.push('/add')} />}
            />
          ) : null
        }
        contentContainerStyle={{ paddingBottom: ins.bottom + 110 }}
        keyboardShouldPersistTaps="handled"
      />

      {!searching && (
        <Animated.View entering={ZoomIn.delay(150).duration(250)} style={{ position: 'absolute', right: 20, bottom: ins.bottom + 24 }}>
          <Pressable
            onPress={() => (tap(), router.push('/add'))}
            accessibilityLabel="Connect with someone"
            style={({ pressed }) => ({
              width: 60,
              height: 60,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              transform: [{ scale: pressed ? 0.92 : 1 }],
              shadowColor: t.grad[1],
              shadowOpacity: 0.45,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 6 },
              elevation: 8,
            })}
          >
            <LinearGradient colors={t.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Ionicons name="add" size={30} color={t.onAccent} />
          </Pressable>
        </Animated.View>
      )}

      <Sheet visible={!!menu} onClose={() => setMenu(null)} title={menu?.label}>
        {menu &&
          (
            [
              ['person-circle-outline', 'Contact info', () => router.push(`/contact/${menu.id}`)],
              [
                'brush-outline',
                'Clear chat',
                () => confirm('Clear this chat?', 'Messages are removed from this phone only.', 'Clear', () => core.clearChat(menu.id), true),
              ],
              [
                'trash-outline',
                'Delete chat',
                () => confirm('Delete chat and contact?', 'You will need their code to connect again.', 'Delete', () => core.removeContact(menu.id), true),
              ],
            ] as const
          )
            .filter(([icon]) => menu.id !== core.myId() || icon !== 'trash-outline')
            .map(([icon, text, go]) => (
              <Pressable
                key={text}
                onPress={() => (setMenu(null), go())}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}
              >
                <Ionicons name={icon} size={21} color={icon === 'trash-outline' ? t.red : t.text} />
                <Text style={{ color: icon === 'trash-outline' ? t.red : t.text, fontSize: 16, fontWeight: '600' }}>{text}</Text>
              </Pressable>
            ))}
      </Sheet>
    </View>
  );
}
