import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { metaOf, summary, type Msg } from '../lib/core';
import { clock } from '../lib/time';
import { useT } from '../lib/theme';
import { ask, choose, confirm, tap, type IconName } from './ui';

const QUICK = ['❤️', '👍', '😂', '😮', '😢', '🔥', '🙏'];
const ease = Easing.out(Easing.cubic);

type Props = {
  m: Msg | null;
  myReact?: string;
  onClose: () => void;
  onReact: (m: Msg, e: string) => void;
  onReply: (m: Msg) => void;
  onCopy: (m: Msg) => void;
  onEdit: (m: Msg) => void;
  onStar: (m: Msg) => void;
  onPin: (m: Msg) => void;
  onRemind: (m: Msg) => void;
  onShare: (m: Msg) => void;
  onDeleteMe: (m: Msg) => void;
  onDeleteAll: (m: Msg) => void;
};

export function MessageMenu(p: Props) {
  const t = useT();
  const m = p.m;
  if (!m) return null;
  const act = (f: (m: Msg) => void) => () => {
    tap();
    p.onClose();
    f(m);
  };
  const del = () => {
    p.onClose();
    if (m.mine && !m.gone)
      choose(
        'Delete message?',
        'Delete for everyone removes it from both phones.',
        ['Delete for everyone', () => p.onDeleteAll(m)],
        ['Delete for me', () => p.onDeleteMe(m)],
      );
    else confirm('Delete for you?', 'It stays on the other phone.', 'Delete', () => p.onDeleteMe(m), true);
  };
  type Action = [IconName, string, () => void, boolean?];
  const media = m.kind !== 'text';
  const extra: Action[] = [
    ...(m.body ? [['copy-outline', 'Copy', act(p.onCopy)] as Action] : []),
    ...(m.mine && !m.once ? [['create-outline', media ? 'Edit caption' : 'Edit', act(p.onEdit)] as Action] : []),
    ...(media && !m.once && metaOf(m).local ? [['share-outline', 'Share', act(p.onShare)] as Action] : []),
  ];
  const actions: Action[] = m.gone
    ? [['trash-outline', 'Delete', del, true]]
    : [
        ['arrow-undo-outline', 'Reply', act(p.onReply)],
        ...extra,
        [m.pin ? 'pin' : 'pin-outline', m.pin ? 'Unpin' : 'Pin', act(p.onPin)],
        [m.star ? 'star' : 'star-outline', m.star ? 'Unstar' : 'Star', act(p.onStar)],
        ['alarm-outline', 'Remind me', act(p.onRemind)],
        ['trash-outline', 'Delete', del, true],
      ];
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={p.onClose}>
      <Animated.View entering={FadeIn.duration(160)} style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <Pressable
            onPress={p.onClose}
            style={{ flex: 1, backgroundColor: t.dark ? 'rgba(0,0,0,0.72)' : 'rgba(10,12,18,0.35)', justifyContent: 'center', padding: 20 }}
          >
            <View style={{ alignItems: m.mine ? 'flex-end' : 'flex-start', gap: 10 }}>
              {!m.gone && (
                <Animated.View
                  entering={FadeInDown.duration(220).easing(ease)}
                  style={{ flexDirection: 'row', backgroundColor: t.surface, borderRadius: 28, padding: 6, gap: 2, borderWidth: 1, borderColor: t.line }}
                >
                  {QUICK.map((e) => (
                    <Pressable
                      key={e}
                      onPress={act((mm) => p.onReact(mm, e))}
                      style={({ pressed }) => ({
                        width: 42,
                        height: 42,
                        borderRadius: 21,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: p.myReact === e ? t.accentDim : 'transparent',
                        transform: [{ scale: pressed ? 1.25 : 1 }],
                      })}
                    >
                      <Text style={{ fontSize: 24 }}>{e}</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => {
                      p.onClose();
                      ask('React', 'Pick any emoji from your keyboard.', 'React', (v) => v.trim() && p.onReact(m, [...v.trim()].slice(0, 2).join('')), {
                        placeholder: '🙂',
                      });
                    }}
                    style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }}
                    accessibilityLabel="More reactions"
                  >
                    <Ionicons name="add" size={22} color={t.text} />
                  </Pressable>
                </Animated.View>
              )}
              <Animated.View
                entering={FadeIn.duration(200)}
                style={{ maxWidth: '84%', backgroundColor: m.mine ? t.mine : t.theirs, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 }}
              >
                <Text numberOfLines={8} style={{ color: m.mine ? t.onAccent : t.text, fontSize: 15.5, lineHeight: 21 }}>
                  {summary(m)}
                </Text>
                <Text style={{ color: m.mine ? t.onAccentSub : t.sub, fontSize: 11, alignSelf: 'flex-end', marginTop: 2 }}>{clock(m.ts)}</Text>
              </Animated.View>
              <Animated.View
                entering={FadeInUp.duration(220).easing(ease)}
                style={{ width: 230, backgroundColor: t.surface, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: t.line }}
              >
                {actions.map(([icon, label, onPress, danger], i) => (
                  <Pressable
                    key={label}
                    onPress={onPress}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 16,
                      height: 50,
                      gap: 12,
                      backgroundColor: pressed ? t.surface2 : 'transparent',
                      borderTopWidth: i ? 1 : 0,
                      borderColor: t.line,
                    })}
                  >
                    <Text style={{ flex: 1, color: danger ? t.red : t.text, fontSize: 15.5, fontWeight: '600' }}>{label}</Text>
                    <Ionicons name={icon} size={19} color={danger ? t.red : t.text} />
                  </Pressable>
                ))}
              </Animated.View>
            </View>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}
