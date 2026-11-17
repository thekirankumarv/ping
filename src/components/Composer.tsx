import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ComponentRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, FadeOutDown, LinearTransition, useAnimatedStyle, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { summary, type Msg } from '../lib/core';
import { laterPicks, TTLS, ttlShort } from '../lib/time';
import { MONO, useLook, useT } from '../lib/theme';
import { Markdown } from './Markdown';
import { RecordingBar, useRecorder } from './Recorder';
import { haptic, IconBtn, Seg, Sheet, tap, type IconName } from './ui';

type Sel = { start: number; end: number };
type Fmt = { icon: IconName; label: string; apply: (v: string, s: Sel) => [string, Sel] };

const wrap =
  (l: string, r = l): Fmt['apply'] =>
  (v, s) => {
    const inner = v.slice(s.start, s.end);
    return [v.slice(0, s.start) + l + inner + r + v.slice(s.end), { start: s.start + l.length, end: s.end + l.length }];
  };
// Prefixes every selected line (or the current one).
const lines =
  (prefix: (i: number) => string): Fmt['apply'] =>
  (v, s) => {
    const a = v.lastIndexOf('\n', s.start - 1) + 1;
    const nb = v.indexOf('\n', s.end);
    const b = nb < 0 ? v.length : nb;
    const out = v
      .slice(a, b)
      .split('\n')
      .map((ln, i) => prefix(i) + ln)
      .join('\n');
    const at = a + out.length;
    return [v.slice(0, a) + out + v.slice(b), { start: at, end: at }];
  };
const block: Fmt['apply'] = (v, s) => {
  const inner = v.slice(s.start, s.end);
  const pre = s.start && v[s.start - 1] !== '\n' ? '\n' : '';
  const ins = `${pre}\`\`\`\n${inner}\n\`\`\`\n`;
  const at = s.start + pre.length + 4 + inner.length;
  return [v.slice(0, s.start) + ins + v.slice(s.end), { start: at, end: at }];
};

const FMT: Fmt[] = [
  { icon: 'text', label: 'Bold', apply: wrap('**') },
  { icon: 'remove-outline', label: 'Strike', apply: wrap('~~') },
  { icon: 'code-outline', label: 'Inline code', apply: wrap('`') },
  { icon: 'code-slash-outline', label: 'Code block', apply: block },
  { icon: 'checkbox-outline', label: 'Checklist', apply: lines(() => '- [ ] ') },
  { icon: 'list-outline', label: 'List', apply: lines(() => '- ') },
  { icon: 'reorder-four-outline', label: 'Numbered list', apply: lines((i) => `${i + 1}. `) },
  { icon: 'chatbox-ellipses-outline', label: 'Quote', apply: lines(() => '> ') },
  { icon: 'eye-off-outline', label: 'Spoiler', apply: wrap('||') },
  { icon: 'reader-outline', label: 'Heading', apply: lines(() => '## ') },
];

export type ComposerHandle = { edit: (m: Msg) => void; focus: () => void };
export type SendOpts = { ttl?: number; quiet?: boolean; at?: number };
type Props = {
  draft: string;
  ttl: number;
  self: boolean;
  reply: Msg | null;
  replyName: string;
  onCancelReply: () => void;
  onSend: (body: string, o: SendOpts) => void;
  onEdit: (id: string, body: string) => void;
  onType: (v: string) => void;
  onAttach: () => void;
  onVoice: (uri: string, dur: number, wave: number[]) => void;
};

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(p, ref) {
  const t = useT();
  const ins = useSafeAreaInsets();
  const fs = useLook((l) => l.font);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [v, setV] = useState(p.draft);
  const [sel, setSel] = useState<Sel>({ start: p.draft.length, end: p.draft.length });
  // Selection is only forced right after formatting; a fully controlled selection makes Android typing jumpy.
  const [forced, setForced] = useState<Sel>();
  const onSel = (s: Sel) => {
    setSel(s);
    setForced(undefined);
  };
  const [tools, setTools] = useState(false);
  const [editing, setEditing] = useState<Msg | null>(null);
  const [big, setBig] = useState(false);
  const [timer, setTimer] = useState<number | undefined>();
  const [sheet, setSheet] = useState<'menu' | 'ttl' | 'when' | null>(null);
  const rec = useRecorder(p.onVoice);
  // The keyboard covers the navigation bar, so its inset only applies while the keyboard is down.
  const { progress } = useReanimatedKeyboardAnimation();
  const pad = useAnimatedStyle(() => ({ paddingBottom: 6 + ins.bottom * (1 - progress.value) }));

  useImperativeHandle(ref, () => ({
    edit: (m) => {
      setEditing(m);
      setTools(false);
      setV(m.body);
      setForced({ start: m.body.length, end: m.body.length });
      setTimeout(() => input.current?.focus(), 50);
    },
    focus: () => input.current?.focus(),
  }));
  useEffect(() => {
    if (p.reply) input.current?.focus();
  }, [p.reply]);

  const change = (next: string) => {
    setV(next);
    if (!editing) p.onType(next);
  };
  const format = (f: Fmt) => {
    tap();
    const [next, s] = f.apply(v, sel);
    change(next);
    setSel(s);
    setForced(s);
  };
  const cancelEdit = () => {
    setEditing(null);
    setV('');
  };
  const send = (o: Omit<SendOpts, 'ttl'> = {}) => {
    if (!v.trim() && !(editing && editing.kind !== 'text')) return;
    haptic.light();
    if (editing) {
      p.onEdit(editing.id, v);
      setEditing(null);
    } else p.onSend(v, { ...o, ttl: timer });
    setV('');
    onSel({ start: 0, end: 0 });
    setTimer(undefined);
    setBig(false);
  };
  const eff = timer ?? p.ttl;
  const ready = !!v.trim() || (!!editing && editing.kind !== 'text');
  const row = (label: string, onPress: () => void, icon: IconName, on?: boolean) => (
    <Pressable
      key={label}
      onPress={() => (tap(), onPress())}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}
    >
      <Ionicons name={icon} size={20} color={t.sub} />
      <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: '600' }}>{label}</Text>
      {on && <Ionicons name="checkmark-circle" size={22} color={t.accent} />}
    </Pressable>
  );

  const toolbar = (
    <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingHorizontal: 8 }}>
      {FMT.map((f) => (
        <Pressable
          key={f.label}
          onPress={() => format(f)}
          accessibilityLabel={f.label}
          style={({ pressed }) => ({
            width: 40,
            height: 36,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? t.accentDim : 'transparent',
          })}
        >
          {f.label === 'Bold' ? (
            <Text style={{ color: t.text, fontWeight: '900', fontSize: 17 }}>B</Text>
          ) : f.label === 'Strike' ? (
            <Text style={{ color: t.text, fontWeight: '700', fontSize: 17, textDecorationLine: 'line-through' }}>S</Text>
          ) : f.label === 'Heading' ? (
            <Text style={{ color: t.text, fontWeight: '900', fontSize: 16 }}>H</Text>
          ) : (
            <Ionicons name={f.icon} size={19} color={t.text} />
          )}
        </Pressable>
      ))}
    </ScrollView>
  );

  const banner = (editing || p.reply) && (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(150)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginHorizontal: 10,
        marginBottom: 6,
        padding: 10,
        borderRadius: 16,
        backgroundColor: t.surface2,
      }}
    >
      <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: t.accent }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.accent, fontWeight: '800', fontSize: 12.5 }}>{editing ? 'Editing' : `Replying to ${p.replyName}`}</Text>
        <Text numberOfLines={1} style={{ color: t.sub, fontSize: 13.5 }}>
          {summary((editing ?? p.reply)!)}
        </Text>
      </View>
      <IconBtn name="close" size={18} label="Cancel" onPress={editing ? cancelEdit : p.onCancelReply} />
    </Animated.View>
  );

  return (
    <Animated.View style={[{ paddingTop: 6, backgroundColor: t.bg }, pad]}>
      {banner}
      <Animated.View layout={LinearTransition.duration(200)} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 8 }}>
        {rec.mode !== 'idle' ? (
          <RecordingBar r={rec} />
        ) : (
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'flex-end',
              backgroundColor: t.surface,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: t.line,
              minHeight: 48,
              paddingLeft: 4,
            }}
          >
            <IconBtn
              name={tools ? 'close-circle' : 'text-outline'}
              size={21}
              color={tools ? t.accent : t.sub}
              label="Formatting"
              onPress={() => setTools(!tools)}
            />
            <TextInput
              ref={input}
              value={v}
              onChangeText={change}
              selection={forced}
              onSelectionChange={(e) => onSel(e.nativeEvent.selection)}
              placeholder={editing ? 'Edit message' : 'Message'}
              placeholderTextColor={t.dim}
              selectionColor={t.accent}
              multiline
              style={{
                flex: 1,
                color: t.text,
                fontSize: 16 * fs,
                lineHeight: 21 * fs,
                maxHeight: 150,
                paddingTop: 13,
                paddingBottom: 13,
                paddingHorizontal: 4,
              }}
            />
            {(v.length > 120 || v.includes('\n')) && <IconBtn name="expand-outline" size={18} color={t.sub} label="Full editor" onPress={() => setBig(true)} />}
            {!!eff && !editing && !p.self && (
              <Pressable onPress={() => setSheet('ttl')} style={{ height: 46, justifyContent: 'center', paddingHorizontal: 8 }}>
                <Text style={{ color: t.accent, fontSize: 12, fontWeight: '800' }}>{ttlShort(eff)}</Text>
              </Pressable>
            )}
            {!editing && !v && <IconBtn name="attach" size={22} color={t.sub} label="Attach" onPress={p.onAttach} />}
          </View>
        )}
        {!ready && !editing ? (
          <Pressable
            onPressIn={rec.pressIn}
            onPressOut={rec.pressOut}
            onPress={rec.mode === 'locked' ? rec.send : undefined}
            accessibilityLabel={rec.mode === 'locked' ? 'Send voice message' : 'Hold to record a voice message'}
            style={({ pressed }) => ({ transform: [{ scale: pressed || rec.mode === 'hold' ? 1.12 : 1 }] })}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                backgroundColor: t.surface2,
              }}
            >
              {rec.mode !== 'idle' && <LinearGradient colors={t.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
              <Ionicons name={rec.mode === 'locked' ? 'arrow-up' : 'mic'} size={22} color={rec.mode !== 'idle' ? t.onAccent : t.text} />
            </View>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => send()}
            onLongPress={() => !editing && !p.self && (haptic.medium(), setSheet('menu'))}
            disabled={!ready}
            accessibilityLabel={editing ? 'Save edit' : 'Send'}
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.9 : 1 }] })}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: t.surface2,
                overflow: 'hidden',
              }}
            >
              {ready && <LinearGradient colors={t.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
              {ready ? (
                <Animated.View key="on" entering={ZoomIn.duration(180).easing(Easing.out(Easing.cubic))} exiting={ZoomOut.duration(120)}>
                  <Ionicons name={editing ? 'checkmark' : 'arrow-up'} size={22} color={t.onAccent} />
                </Animated.View>
              ) : (
                <Ionicons name="arrow-up" size={22} color={t.dim} />
              )}
            </View>
          </Pressable>
        )}
      </Animated.View>
      {/* Below the input so Android's cut/copy/paste bar, which floats above the selection, never covers it. */}
      {tools && (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={{ marginTop: 4 }}>
          {toolbar}
        </Animated.View>
      )}

      <Sheet visible={sheet === 'menu'} onClose={() => setSheet(null)} title="Send options">
        {row('Send without sound', () => (setSheet(null), send({ quiet: true })), 'notifications-off-outline')}
        {row('Schedule message', () => setSheet('when'), 'alarm-outline')}
        {row(`Disappear after · ${TTLS.find(([s]) => s === eff)?.[1] ?? 'Off'}`, () => setSheet('ttl'), 'timer-outline')}
      </Sheet>
      <Sheet visible={sheet === 'when'} onClose={() => setSheet(null)} title="Send later">
        <Text style={{ color: t.sub, fontSize: 13.5, marginBottom: 6 }}>
          PING sends it at this time while the app is running, or the next time you open it.
        </Text>
        {laterPicks().map(([label, at]) => row(label, () => (setSheet(null), send({ at })), 'time-outline'))}
      </Sheet>
      <Sheet visible={sheet === 'ttl'} onClose={() => setSheet(null)} title="Disappear after">
        <Text style={{ color: t.sub, fontSize: 13.5, marginBottom: 10 }}>Applies to this message only. Timer starts when it is read.</Text>
        {TTLS.map(([s, label]) => row(label, () => (setTimer(s), setSheet(null)), s ? 'timer-outline' : 'infinite-outline', eff === s))}
      </Sheet>

      <BigEditor
        visible={big}
        value={v}
        onChange={change}
        sel={forced}
        setSel={onSel}
        toolbar={toolbar}
        onClose={() => setBig(false)}
        onSend={() => send()}
        editing={!!editing}
      />
    </Animated.View>
  );
});

function BigEditor(p: {
  visible: boolean;
  value: string;
  onChange: (v: string) => void;
  sel?: Sel;
  setSel: (s: Sel) => void;
  toolbar: React.ReactNode;
  onClose: () => void;
  onSend: () => void;
  editing: boolean;
}) {
  const t = useT();
  const ins = useSafeAreaInsets();
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  return (
    <Modal visible={p.visible} animationType="slide" onRequestClose={p.onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: t.bg, paddingTop: ins.top + 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 8 }}>
          <IconBtn name="chevron-down" label="Close editor" onPress={p.onClose} />
          <View style={{ flex: 1 }}>
            <Seg
              options={[
                ['write', 'Write'],
                ['preview', 'Preview'],
              ]}
              value={tab}
              onChange={setTab}
            />
          </View>
          <Pressable
            onPress={p.onSend}
            disabled={!p.value.trim()}
            style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: p.value.trim() ? t.grad[0] : t.surface2, justifyContent: 'center' }}
          >
            <Text style={{ color: p.value.trim() ? t.onAccent : t.dim, fontWeight: '800' }}>{p.editing ? 'Save' : 'Send'}</Text>
          </Pressable>
        </View>
        {tab === 'write' ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: t.line, paddingVertical: 6, marginTop: 6 }}>
              <View style={{ flex: 1 }}>{p.toolbar}</View>
              <Text style={{ color: t.dim, fontSize: 11.5, paddingHorizontal: 12 }}>{p.value.length}</Text>
            </View>
            <TextInput
              autoFocus
              value={p.value}
              onChangeText={p.onChange}
              selection={p.sel}
              onSelectionChange={(e) => p.setSel(e.nativeEvent.selection)}
              multiline
              textAlignVertical="top"
              placeholder={'Write anything. Markdown works:\n**bold**  ~~strike~~  `code`  ||spoiler||\n- [ ] checklist\n```\ncode block\n```'}
              placeholderTextColor={t.dim}
              selectionColor={t.accent}
              style={{ flex: 1, color: t.text, fontSize: 15.5, lineHeight: 22, padding: 18, fontFamily: p.value.includes('```') ? MONO : undefined }}
            />
          </>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: ins.bottom + 40 }}>
            {p.value.trim() ? <Markdown src={p.value} color={t.text} sub={t.sub} /> : <Text style={{ color: t.dim }}>Nothing to preview</Text>}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
