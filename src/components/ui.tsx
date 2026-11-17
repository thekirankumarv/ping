import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Animated, { FadeInDown, FadeOutDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { DISPLAY, styles, useT } from '../lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];
const native = Platform.OS !== 'web';

export const haptic = {
  tap: () => native && Haptics.selectionAsync(),
  light: () => native && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => native && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  rigid: () => native && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid),
  ok: () => native && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warn: () => native && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
};
export const tap = haptic.tap;

// Keyboard height from the OS events. KeyboardAvoidingView can't measure inside transparent modals on Android.
export function useKeyboardHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setH(e.endCoordinates.height));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return h;
}
export const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

const useToast = create<{ msg?: string; icon?: IconName; n: number }>()(() => ({ n: 0 }));
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string, icon: IconName = 'checkmark-circle') {
  clearTimeout(toastTimer);
  useToast.setState((s) => ({ msg, icon, n: s.n + 1 }));
  toastTimer = setTimeout(() => useToast.setState({ msg: undefined }), 1800);
}
export async function copy(text: string, what = 'Copied') {
  // Hidden from the Android clipboard preview and keyboard suggestions.
  await Clipboard.setStringAsync(text, { android: { isSensitive: true } });
  haptic.ok();
  toast(what === 'Copied' ? 'Copied' : `${what} copied`, 'copy');
}
export function ToastHost() {
  const { msg, icon, n } = useToast();
  const t = useT();
  const ins = useSafeAreaInsets();
  if (!msg) return null;
  return (
    <Animated.View
      key={n}
      entering={FadeInDown.duration(300)}
      exiting={FadeOutDown.duration(180)}
      pointerEvents="none"
      style={{
        position: 'absolute',
        bottom: ins.bottom + 104,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 11,
        borderRadius: 99,
        backgroundColor: t.dark ? '#F2F4F8' : '#0B0D12',
      }}
    >
      <Ionicons name={icon} size={16} color={t.dark ? '#0B0D12' : '#F2F4F8'} />
      <Text style={{ color: t.dark ? '#0B0D12' : '#F2F4F8', fontWeight: '700', fontSize: 14 }}>{msg}</Text>
    </Animated.View>
  );
}

const useBusy = create<{ msg?: string }>()(() => ({}));
export async function busy<T>(msg: string, work: () => Promise<T>): Promise<T> {
  useBusy.setState({ msg });
  await new Promise((r) => setTimeout(r, 60)); // let the overlay paint before the CPU-heavy part
  try {
    return await work();
  } finally {
    useBusy.setState({ msg: undefined });
  }
}
export function BusyHost() {
  const msg = useBusy((b) => b.msg);
  const t = useT();
  if (!msg) return null;
  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: 'rgba(3,4,8,0.75)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <View
          style={{
            alignItems: 'center',
            gap: 14,
            backgroundColor: t.surface,
            borderRadius: 24,
            paddingVertical: 28,
            paddingHorizontal: 32,
            borderWidth: 1,
            borderColor: t.line,
          }}
        >
          <ActivityIndicator size="large" color={t.accent} />
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 16 }}>{msg}</Text>
          <Text style={{ color: t.sub, fontSize: 13, textAlign: 'center' }}>Keep PING open, this takes a few seconds.</Text>
        </View>
      </View>
    </Modal>
  );
}

type Dialog = {
  title: string;
  message?: string;
  action?: string;
  onYes?: () => void;
  danger?: boolean;
  alt?: [string, () => void];
  input?: { placeholder?: string; secure?: boolean; onSubmit: (v: string) => void };
};
const useDialogs = create<{ queue: Dialog[]; value: string }>()(() => ({ queue: [], value: '' }));
const show = (d: Dialog) => useDialogs.setState((st) => ({ queue: [...st.queue, d] }));
export const notify = (title: string, message?: string) => show({ title, message });
export const confirm = (title: string, message: string | undefined, action: string, onYes: () => void, danger = false) =>
  show({ title, message, action, onYes, danger });
export const choose = (title: string, message: string, [action, onYes]: [string, () => void], alt: [string, () => void]) =>
  show({ title, message, action, onYes, alt });
export const ask = (title: string, message: string, action: string, onSubmit: (v: string) => void, opt: { placeholder?: string; secure?: boolean } = {}) =>
  show({ title, message, action, input: { ...opt, onSubmit } });

export function DialogHost() {
  const d = useDialogs((st) => st.queue[0]);
  const value = useDialogs((st) => st.value);
  const kb = useKeyboardHeight();
  const t = useT();
  const s = useS();
  const close = (then?: () => void) => {
    useDialogs.setState((st) => ({ queue: st.queue.slice(1), value: '' }));
    then?.();
  };
  if (!d) return null;
  const tone = d.danger ? t.red : t.accent;
  const yes = () => close(d.input ? () => d.input!.onSubmit(value) : d.onYes);
  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={() => close()}>
      <View style={{ flex: 1, paddingBottom: kb }}>
        <Pressable style={s.backdrop} onPress={() => close()}>
          <Pressable style={s.dialog} testID="dialog">
            <View style={[s.dialogIcon, { backgroundColor: tone + '22' }]}>
              <Ionicons
                name={
                  d.action === 'Delete'
                    ? 'trash-outline'
                    : d.danger
                      ? 'warning-outline'
                      : d.input
                        ? 'key-outline'
                        : d.action
                          ? 'help-circle-outline'
                          : 'information-circle-outline'
                }
                size={24}
                color={tone}
              />
            </View>
            <Text style={s.dialogTitle}>{d.title}</Text>
            {!!d.message && <Text style={s.dialogText}>{d.message}</Text>}
            {d.input && (
              <TextInput
                autoFocus
                value={value}
                onChangeText={(v) => useDialogs.setState({ value: v })}
                placeholder={d.input.placeholder}
                placeholderTextColor={t.dim}
                secureTextEntry={d.input.secure}
                onSubmitEditing={yes}
                style={[s.input, { alignSelf: 'stretch' }]}
              />
            )}
            {d.alt ? (
              <View style={{ gap: 10, marginTop: 8, alignSelf: 'stretch' }}>
                <Btn label={d.action!} onPress={() => close(d.onYes)} />
                <Btn label={d.alt[0]} kind="ghost" onPress={() => close(d.alt![1])} />
                <Btn label="Cancel" kind="ghost" onPress={() => close()} />
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, alignSelf: 'stretch' }}>
                {d.action ? (
                  <>
                    <View style={{ flex: 1 }}>
                      <Btn label="Cancel" kind="ghost" onPress={() => close()} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Btn label={d.action} kind={d.danger ? 'danger' : 'primary'} onPress={yes} />
                    </View>
                  </>
                ) : (
                  <View style={{ flex: 1 }}>
                    <Btn label="OK" onPress={() => close()} />
                  </View>
                )}
              </View>
            )}
          </Pressable>
        </Pressable>
      </View>
    </Modal>
  );
}
export const confirmDelete = (what: string, onYes: () => void) => confirm(`Delete ${what}?`, 'This can’t be undone.', 'Delete', onYes, true);

export function Screen({ children, scroll, pad = true, bottom = 120 }: { children: ReactNode; scroll?: boolean; pad?: boolean; bottom?: number }) {
  const ins = useSafeAreaInsets();
  const t = useT();
  const style = { paddingTop: ins.top + 8, paddingHorizontal: pad ? 18 : 0 };
  if (scroll)
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior="padding">
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[style, { paddingBottom: ins.bottom + bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  return <View style={[{ flex: 1, backgroundColor: t.bg }, style]}>{children}</View>;
}

export function Header({ title, sub, back, right }: { title: string; sub?: string; back?: boolean; right?: ReactNode }) {
  const s = useS();
  return (
    <View style={s.header}>
      {back && <IconBtn name="chevron-back" onPress={goBack} label="Back" />}
      <View style={{ flex: 1 }}>
        {!!sub && <Text style={s.eyebrow}>{sub}</Text>}
        <Text style={[s.h1, back && { fontSize: 24 }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>{right}</View>
    </View>
  );
}

export function IconBtn({
  name,
  onPress,
  color,
  size = 21,
  label,
  filled,
}: {
  name: IconName;
  onPress: () => void;
  color?: string;
  size?: number;
  label?: string;
  filled?: boolean;
}) {
  const t = useT();
  return (
    <Pressable
      onPress={() => (tap(), onPress())}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label ?? name.replace(/-outline$/, '').replace(/-/g, ' ')}
      style={({ pressed }) => ({
        width: 42,
        height: 42,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? t.surface2 : 'transparent',
        opacity: pressed ? 0.55 : 1,
      })}
    >
      <Ionicons name={name} size={size} color={color ?? t.text} />
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const s = useS();
  return <View style={[s.card, style]}>{children}</View>;
}

export function Chip({ label, active, onPress, color, icon }: { label: string; active?: boolean; onPress?: () => void; color?: string; icon?: IconName }) {
  const t = useT();
  const s = useS();
  const c = color ?? t.grad[0];
  return (
    <Pressable
      onPress={() => (tap(), onPress?.())}
      disabled={!onPress}
      style={({ pressed }) => [s.chip, active && { backgroundColor: c, borderColor: c }, pressed && { opacity: 0.7 }]}
    >
      {icon && <Ionicons name={icon} size={14} color={active ? t.onAccent : t.sub} />}
      <Text style={[s.chipText, active && { color: t.onAccent }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingRight: 18 }}
      keyboardShouldPersistTaps="handled"
      style={{ flexGrow: 0 }}
    >
      {children}
    </ScrollView>
  );
}

export function Seg<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  const s = useS();
  const t = useT();
  return (
    <View style={s.seg}>
      {options.map(([v, label]) => {
        const on = v === value;
        return (
          <Pressable key={v} onPress={() => (tap(), onChange(v))} style={[s.segItem, on && { backgroundColor: t.surface, shadowOpacity: t.dark ? 0 : 0.08 }]}>
            <Text style={[s.segText, on && { color: t.text }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Btn({
  label,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  small,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  small?: boolean;
}) {
  const t = useT();
  const s = useS();
  const bg = kind === 'primary' ? t.grad[0] : kind === 'danger' ? t.red + '1F' : t.surface2;
  const fg = kind === 'primary' ? t.onAccent : kind === 'danger' ? t.red : t.text;
  return (
    <Pressable
      disabled={disabled}
      onPress={() => (tap(), onPress())}
      style={({ pressed }) => [
        s.btn,
        small && { height: 40, borderRadius: 13, paddingHorizontal: 14 },
        { backgroundColor: bg, opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.97 : 1 }], overflow: 'hidden' },
      ]}
    >
      {kind === 'primary' && <LinearGradient colors={t.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
      {icon && <Ionicons name={icon} size={small ? 16 : 18} color={fg} />}
      <Text style={[s.btnText, small && { fontSize: 14 }, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({ label, ...p }: { label: string } & TextInputProps) {
  const t = useT();
  const s = useS();
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={t.dim} selectionColor={t.accent} style={s.input} {...p} />
    </View>
  );
}

export function Row({
  icon,
  iconColor,
  title,
  sub,
  right,
  onPress,
  danger,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  sub?: string;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  const t = useT();
  const s = useS();
  const c = danger ? t.red : (iconColor ?? t.accent);
  return (
    <Pressable onPress={onPress && (() => (tap(), onPress()))} disabled={!onPress} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
      {icon && (
        <View style={[s.rowIcon, { backgroundColor: c + '1C' }]}>
          <Ionicons name={icon} size={19} color={c} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[s.rowTitle, danger && { color: t.red }]} numberOfLines={1}>
          {title}
        </Text>
        {!!sub && (
          <Text style={s.small} numberOfLines={2}>
            {sub}
          </Text>
        )}
      </View>
      {right ?? (onPress && <Ionicons name="chevron-forward" size={18} color={t.dim} />)}
    </Pressable>
  );
}

export function Section({ title, right }: { title: string; right?: ReactNode }) {
  const s = useS();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 12 }}>
      <Text style={s.section}>{title}</Text>
      {right}
    </View>
  );
}

export function Empty({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: ReactNode }) {
  const t = useT();
  const s = useS();
  return (
    <Animated.View entering={FadeInDown.duration(400)} style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 10 }}>
      <View style={{ width: 76, height: 76, borderRadius: 26, backgroundColor: t.accentDim, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        <Ionicons name={icon} size={34} color={t.accent} />
      </View>
      <Text style={[s.rowTitle, { fontSize: 18 }]}>{title}</Text>
      <Text style={[s.small, { textAlign: 'center', lineHeight: 20 }]}>{text}</Text>
      {action && <View style={{ marginTop: 10, alignSelf: 'stretch' }}>{action}</View>}
    </Animated.View>
  );
}

export function Search({ value, onChange, placeholder = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const t = useT();
  const s = useS();
  return (
    <View style={s.search}>
      <Ionicons name="search" size={18} color={t.dim} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.dim}
        selectionColor={t.accent}
        style={{ flex: 1, color: t.text, fontSize: 15.5, paddingVertical: 0 }}
        returnKeyType="search"
      />
      {!!value && <IconBtn name="close-circle" size={18} color={t.dim} onPress={() => onChange('')} label="Clear search" />}
    </View>
  );
}

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const s = useS();
  const ins = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  useEffect(() => {
    if (visible) haptic.light();
  }, [visible]);
  return (
    <Modal transparent visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={[s.backdrop, { justifyContent: 'flex-end', padding: 0 }]} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: (kb || ins.bottom) + 18 }]}>
          <View style={s.grabber} />
          {title && <Text style={[s.dialogTitle, { textAlign: 'left', marginBottom: 6 }]}>{title}</Text>}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export const Layout = LinearTransition.duration(300);

export const useS = styles((t) =>
  StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, minHeight: 48 },
    eyebrow: { color: t.sub, fontSize: 13, fontWeight: '600', letterSpacing: 0.3, marginBottom: 2 },
    h1: { color: t.text, fontSize: 30, fontFamily: DISPLAY, letterSpacing: -0.8 },
    section: { color: t.sub, fontSize: 12.5, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
    card: { backgroundColor: t.surface, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: t.line },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.surface,
    },
    chipText: { color: t.sub, fontSize: 13.5, fontWeight: '700' },
    seg: { flexDirection: 'row', backgroundColor: t.surface2, borderRadius: 15, padding: 4, gap: 4 },
    segItem: {
      flex: 1,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0,
    },
    segText: { color: t.sub, fontSize: 14, fontWeight: '700' },
    btn: { height: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
    btnText: { fontSize: 16, fontFamily: DISPLAY, letterSpacing: 0.1 },
    label: { color: t.sub, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.4 },
    input: {
      backgroundColor: t.surface2,
      color: t.text,
      borderRadius: 14,
      paddingHorizontal: 14,
      height: 50,
      fontSize: 15.5,
      borderWidth: 1,
      borderColor: t.line,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
    rowIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { color: t.text, fontSize: 15.5, fontWeight: '700' },
    small: { color: t.sub, fontSize: 13 },
    text: { color: t.text, fontSize: 15 },
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      height: 50,
      borderRadius: 17,
      paddingLeft: 16,
      paddingRight: 6,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.line,
    },
    backdrop: { flex: 1, backgroundColor: 'rgba(3,4,8,0.62)', justifyContent: 'center', padding: 26 },
    dialog: { backgroundColor: t.surface, borderRadius: 26, padding: 22, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: t.line },
    dialogIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    dialogTitle: { color: t.text, fontSize: 20, fontFamily: DISPLAY, textAlign: 'center', alignSelf: 'stretch' },
    dialogText: { color: t.sub, fontSize: 14.5, lineHeight: 21, textAlign: 'center' },
    sheet: { backgroundColor: t.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, gap: 4, borderWidth: 1, borderColor: t.line },
    grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: t.line, marginBottom: 12 },
  }),
);
