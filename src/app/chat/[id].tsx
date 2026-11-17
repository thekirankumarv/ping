import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, Pressable, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutUp, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, useRing } from '../../components/Avatar';
import { Bubble } from '../../components/Bubble';
import { Composer, type ComposerHandle, type SendOpts } from '../../components/Composer';
import { MessageMenu } from '../../components/MessageMenu';
import { TypingBubble } from '../../components/Typing';
import { Wallpaper } from '../../components/Wallpaper';
import { ask, Btn, goBack, haptic, IconBtn, notify, Sheet, tap, toast, type IconName } from '../../components/ui';
import * as core from '../../lib/core';
import { useLive } from '../../lib/db';
import { attachPreview, MAX_FILE, sendFile, sendImage, sendVoice } from '../../lib/media';
import { sendTyping, usePeer } from '../../lib/relay';
import { remind } from '../../lib/remind';
import { dayLabel, laterPicks, lastSeen, sameDay, TTLS, when } from '../../lib/time';
import { ChatPreset, DISPLAY, isPreset, useT } from '../../lib/theme';

const JOIN_MS = 5 * 60_000;
type Pick = 'photos' | 'camera' | 'doc' | 'once';
const ATTACH: [IconName, string, string, Pick][] = [
  ['images', 'Photos', '#4F8BFF', 'photos'],
  ['camera', 'Camera', '#FF5F7A', 'camera'],
  ['document-text', 'Document', '#9B6BFF', 'doc'],
  ['eye-off', 'View once', '#2EC4A6', 'once'],
];

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useLive(() => core.contact(id), id, id);
  return (
    <ChatPreset.Provider value={isPreset(c?.theme) ? c.theme : null}>
      <Chat />
    </ChatPreset.Provider>
  );
}

function Chat() {
  const { id, jump } = useLocalSearchParams<{ id: string; jump?: string }>();
  const t = useT();
  const ins = useSafeAreaInsets();
  const c = useLive(() => core.contact(id), id, id);
  const msgs = useLive(() => core.messages(id), id, id);
  const pins = useLive(() => core.pinned(id), id, id);
  const later = useLive(() => new Set(core.scheduled(id).map((s) => s.mid)), id, id);
  const peer = usePeer(id);
  const ring = useRing(id);
  const list = useRef<FlatList<core.Msg>>(null);
  const composer = useRef<ComposerHandle>(null);
  const [reply, setReply] = useState<core.Msg | null>(null);
  const [menu, setMenu] = useState<core.Msg | null>(null);
  const [flash, setFlash] = useState<string>();
  const [sheet, setSheet] = useState<'timer' | 'attach' | 'remind' | null>(null);
  const [remindFor, setRemindFor] = useState<core.Msg | null>(null);
  const [pinAt, setPinAt] = useState(0);
  const [away, setAway] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [opened] = useState(Date.now);
  const focused = useRef(false);
  const me = core.myId();
  const self = core.isSelf(id);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  // Read while visible; "after seen" messages go when leaving.
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      if (AppState.currentState === 'active') core.markRead(id);
      const sub = AppState.addEventListener('change', (st) => {
        if (st === 'active') core.markRead(id);
        else core.leave(id);
      });
      return () => {
        focused.current = false;
        sub.remove();
        core.leave(id);
      };
    }, [id]),
  );
  useEffect(() => {
    if (focused.current && AppState.currentState === 'active' && msgs.some((m) => !m.mine && m.status < 3)) core.markRead(id);
  }, [msgs, id]);
  useEffect(() => {
    if (!c?.shots) return;
    ScreenCapture.preventScreenCaptureAsync('chat').catch(() => {});
    return () => void ScreenCapture.allowScreenCaptureAsync('chat').catch(() => {});
  }, [c?.shots]);

  const byId = useMemo(() => new Map(msgs.map((m) => [m.id, m])), [msgs]);
  const jumpTo = useCallback(
    (mid: string) => {
      const index = msgs.findIndex((m) => m.id === mid);
      if (index < 0) return toast('Message not available', 'alert-circle');
      list.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      setFlash(mid);
      setTimeout(() => setFlash(undefined), 1100);
    },
    [msgs],
  );
  useEffect(() => {
    if (jump) setTimeout(() => jumpTo(jump), 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump]);

  const onReply = useCallback((m: core.Msg) => setReply(m), []);
  const onMenu = useCallback((m: core.Msg) => setMenu(m), []);
  const onToggle = useCallback((m: core.Msg, line: number, done: boolean) => core.toggleCheck(m.id, line, done), []);

  if (!c) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  const status = self
    ? 'Only on this phone'
    : peer.typing
      ? 'typing…'
      : peer.online
        ? 'online'
        : peer.seen
          ? lastSeen(peer.seen, now)
          : c.state === 'out'
            ? 'request sent'
            : '';
  const nameOf = (m: core.Msg) => (m.mine ? 'You' : c.label);
  const toBottom = () => list.current?.scrollToOffset({ offset: 0, animated: true });
  const opts = () => ({ reply: reply?.id });
  const sent = () => {
    setReply(null);
    toBottom();
  };

  const pickPhotos = async (once = false) => {
    setSheet(null);
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: !once, selectionLimit: 10, quality: 1 });
    if (r.canceled) return;
    for (const a of r.assets) sendImage(id, a.uri, { ...opts(), once }).catch(() => notify('Couldn’t send that photo'));
    sent();
  };
  const camera = async () => {
    setSheet(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return notify('Camera needed', 'Allow camera access in Settings to take photos.');
    const r = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (r.canceled) return;
    sendImage(id, r.assets[0].uri, opts()).catch(() => notify('Couldn’t send that photo'));
    sent();
  };
  const doc = async () => {
    setSheet(null);
    try {
      const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (r.canceled) return;
      if (sendFile(id, r.assets[0], opts()) === 'too-big') return notify('File too large', 'Files up to 20 MB can be sent.');
      sent();
    } catch {
      notify('Couldn’t open that file');
    }
  };
  const attach = (k: Pick) => (k === 'photos' ? pickPhotos() : k === 'camera' ? camera() : k === 'doc' ? doc() : pickPhotos(true));
  const pin = pins[pinAt % Math.max(1, pins.length)];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Wallpaper kind={c.wall} />
      <View
        style={{
          paddingTop: ins.top + 4,
          paddingBottom: 8,
          paddingHorizontal: 6,
          flexDirection: 'row',
          alignItems: 'center',
          borderBottomWidth: 1,
          borderColor: t.line,
          backgroundColor: t.bg,
        }}
      >
        <IconBtn name="chevron-back" label="Back" onPress={goBack} />
        <Pressable onPress={() => router.push(`/contact/${id}`)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
          <Avatar seed={c.pub} label={c.label} size={40} online={peer.online} self={self} ring={self ? null : ring} story={id} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: t.text, fontSize: 18, fontFamily: DISPLAY, letterSpacing: -0.3 }}>
              {c.label}
            </Text>
            {!!status && (
              <Animated.Text
                key={status}
                entering={FadeIn.duration(200)}
                numberOfLines={1}
                style={{ color: peer.typing || peer.online ? t.accent : t.sub, fontSize: 12.5, fontWeight: '600' }}
              >
                {status}
              </Animated.Text>
            )}
          </View>
        </Pressable>
        {c.state === 'ok' && !self && (
          <>
            <IconBtn name="videocam-outline" label="Video call" onPress={() => router.push({ pathname: '/call/[id]', params: { id, video: '1' } })} />
            <IconBtn name="call-outline" label="Voice call" onPress={() => router.push({ pathname: '/call/[id]', params: { id } })} />
            <IconBtn
              name={c.ttl ? 'timer' : 'timer-outline'}
              color={c.ttl ? t.accent : t.text}
              label="Disappearing messages"
              onPress={() => setSheet('timer')}
            />
          </>
        )}
      </View>

      {pin && (
        <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOutUp.duration(150)}>
          <Pressable
            onPress={() => (tap(), jumpTo(pin.id), setPinAt((n) => n + 1))}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 16,
              paddingVertical: 9,
              backgroundColor: t.surface,
              borderBottomWidth: 1,
              borderColor: t.line,
            }}
          >
            <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: t.accent }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.accent, fontSize: 12, fontWeight: '800' }}>
                {pins.length > 1 ? `Pinned · ${(pinAt % pins.length) + 1} of ${pins.length}` : 'Pinned'}
              </Text>
              <Text numberOfLines={1} style={{ color: t.text, fontSize: 14 }}>
                {core.summary(pin)}
              </Text>
            </View>
            <Ionicons name="pin" size={16} color={t.sub} />
          </Pressable>
        </Animated.View>
      )}

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <FlatList
          ref={list}
          data={msgs}
          inverted
          keyExtractor={(m) => m.id}
          extraData={`${flash}${now}${c.label}${peer.typing}${later.size}`}
          initialNumToRender={25}
          windowSize={11}
          onScrollToIndexFailed={(e) => list.current?.scrollToOffset({ offset: e.averageItemLength * e.index, animated: true })}
          onScroll={(e) => setAway(e.nativeEvent.contentOffset.y > 600)}
          scrollEventThrottle={100}
          contentContainerStyle={{ paddingTop: 10, paddingBottom: 12 }}
          ListHeaderComponent={peer.typing ? <TypingBubble /> : undefined}
          renderItem={({ item: m, index }) => {
            const older = msgs[index + 1];
            const newer = msgs[index - 1];
            const near = (a?: core.Msg) =>
              !!a &&
              a.kind !== 'sys' &&
              a.kind !== 'call' &&
              m.kind !== 'sys' &&
              m.kind !== 'call' &&
              a.mine === m.mine &&
              Math.abs(a.ts - m.ts) < JOIN_MS &&
              sameDay(a.ts, m.ts);
            const newDay = !older || !sameDay(older.ts, m.ts);
            const q = m.reply ? (byId.get(m.reply) ?? core.message(m.reply) ?? null) : undefined;
            return (
              <View>
                {newDay && (
                  <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 6 }}>
                    <Text
                      style={{
                        color: t.sub,
                        fontSize: 12,
                        fontWeight: '700',
                        backgroundColor: t.surface,
                        paddingHorizontal: 12,
                        paddingVertical: 5,
                        borderRadius: 10,
                        overflow: 'hidden',
                      }}
                    >
                      {dayLabel(m.ts, now)}
                    </Text>
                  </View>
                )}
                <Bubble
                  m={m}
                  joinTop={!newDay && near(older)}
                  joinBottom={near(newer) && sameDay(newer!.ts, m.ts)}
                  quoted={q}
                  quotedName={q ? nameOf(q) : ''}
                  flash={flash === m.id}
                  fresh={m.ts > opened}
                  scheduled={later.has(m.id)}
                  now={now}
                  onReply={onReply}
                  onMenu={onMenu}
                  onJump={jumpTo}
                  onToggle={onToggle}
                />
              </View>
            );
          }}
          ListFooterComponent={
            <View style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 40, gap: 8 }}>
              <Ionicons name={self ? 'bookmark' : 'lock-closed'} size={16} color={t.dim} />
              <Text style={{ color: t.dim, fontSize: 12.5, textAlign: 'center', lineHeight: 18 }}>
                {self
                  ? 'Notes, links and files for yourself. Nothing here is sent anywhere.'
                  : `Messages are end-to-end encrypted and stored only on your phones.${c.ttl ? ' Disappearing messages are on.' : ''}`}
              </Text>
            </View>
          }
        />

        {away && (
          <Animated.View entering={ZoomIn.duration(180)} exiting={ZoomOut.duration(150)} style={{ position: 'absolute', right: 16, bottom: 92 }}>
            <Pressable
              onPress={() => (tap(), toBottom())}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: t.surface2,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: t.line,
              }}
              accessibilityLabel="Scroll to latest"
            >
              <Ionicons name="chevron-down" size={22} color={t.text} />
            </Pressable>
          </Animated.View>
        )}

        {c.state === 'ok' ? (
          <Composer
            ref={composer}
            draft={c.draft ?? ''}
            ttl={c.ttl}
            self={self}
            reply={reply}
            replyName={reply ? nameOf(reply) : ''}
            onCancelReply={() => setReply(null)}
            onType={(v) => {
              if (v && !self) sendTyping(id);
              core.setDraft(id, v);
            }}
            onSend={(body, o: SendOpts) => {
              const mid = core.sendText(id, body, { reply: reply?.id, ...o });
              if (mid && /https?:\/\//i.test(body)) attachPreview(mid, body);
              if (o.at) toast(`Scheduled for ${when(o.at)}`, 'alarm-outline');
              sent();
            }}
            onEdit={(mid, body) => core.edit(mid, body)}
            onAttach={() => setSheet('attach')}
            onVoice={(uri, dur, wave) => {
              sendVoice(id, uri, dur, wave, opts());
              sent();
            }}
          />
        ) : (
          <Animated.View
            entering={FadeIn}
            exiting={FadeOut}
            style={{ padding: 18, paddingBottom: ins.bottom + 18, gap: 12, borderTopWidth: 1, borderColor: t.line, backgroundColor: t.bg }}
          >
            {c.state === 'in' ? (
              <>
                <Text style={{ color: t.sub, textAlign: 'center' }}>This person wants to connect with you.</Text>
                <Btn
                  label="Accept"
                  onPress={() => ask('Name this contact', 'Only you see this name.', 'Accept', (v) => core.accept(id, v.trim() || 'Friend'))}
                />
              </>
            ) : c.state === 'out' ? (
              <Text style={{ color: t.sub, textAlign: 'center', lineHeight: 20 }}>Request sent. You can chat once {c.label} accepts.</Text>
            ) : (
              <Btn label="Unblock" kind="ghost" onPress={() => core.unblock(id)} />
            )}
          </Animated.View>
        )}
      </KeyboardAvoidingView>

      <MessageMenu
        m={menu}
        myReact={menu ? JSON.parse(menu.reacts)[me] : undefined}
        onClose={() => setMenu(null)}
        onReact={(m, e) => (haptic.light(), core.react(m.id, e))}
        onReply={onReply}
        onCopy={async (m) => {
          await Clipboard.setStringAsync(m.body);
          toast('Copied', 'copy');
        }}
        onEdit={(m) => composer.current?.edit(m)}
        onStar={(m) => core.star(m.id)}
        onPin={(m) => core.pin(m.id)}
        onRemind={(m) => (setRemindFor(m), setSheet('remind'))}
        onShare={(m) => {
          const x = core.metaOf(m);
          if (x.local) Sharing.shareAsync(x.local, { mimeType: x.mime });
        }}
        onDeleteMe={(m) => core.deleteForMe([m.id])}
        onDeleteAll={(m) => core.deleteForEveryone(m.id)}
      />

      <Sheet visible={sheet === 'attach'} onClose={() => setSheet(null)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
          {ATTACH.map(([icon, label, color, k], i) => (
            <Animated.View key={label} entering={FadeInDown.delay(i * 40).duration(220)} style={{ alignItems: 'center', gap: 8, width: '24%' }}>
              <Pressable
                onPress={() => (tap(), attach(k))}
                style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.92 : 1 }] })}
                accessibilityLabel={label}
              >
                <LinearGradient
                  colors={[color, color + 'AA']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name={icon} size={26} color="#fff" />
                </LinearGradient>
              </Pressable>
              <Text style={{ color: t.text, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>
            </Animated.View>
          ))}
        </View>
        <Text style={{ color: t.dim, fontSize: 12, textAlign: 'center', marginTop: 10 }}>
          Photos are compressed. Files up to {MAX_FILE / 1024 / 1024} MB. Everything is end-to-end encrypted.
        </Text>
      </Sheet>

      <Sheet visible={sheet === 'remind'} onClose={() => setSheet(null)} title="Remind me">
        {laterPicks().map(([label, at]) => (
          <Pressable
            key={label}
            onPress={async () => {
              tap();
              setSheet(null);
              if (remindFor && (await remind(remindFor, at))) toast(`Reminder set for ${when(at)}`, 'alarm-outline');
              else notify('Notifications are off', 'Allow notifications for PING to get reminders.');
            }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}
          >
            <Ionicons name="alarm-outline" size={20} color={t.sub} />
            <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: '600' }}>{label}</Text>
          </Pressable>
        ))}
      </Sheet>

      <Sheet visible={sheet === 'timer'} onClose={() => setSheet(null)} title="Disappearing messages">
        <Text style={{ color: t.sub, fontSize: 13.5, lineHeight: 19, marginBottom: 8 }}>
          New messages in this chat disappear from both phones after this time. The timer starts when a message is read.
        </Text>
        {TTLS.map(([s, label]) => (
          <Pressable
            key={s}
            onPress={() => {
              tap();
              setSheet(null);
              if (s !== c.ttl) core.setTtl(id, s);
            }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: '600' }}>{label}</Text>
            {c.ttl === s && <Ionicons name="checkmark-circle" size={22} color={t.accent} />}
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}
