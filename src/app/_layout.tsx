import '../lib/identity';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import Animated, { Easing, FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLockHost } from '../components/AppLock';
import { ask, Btn, busy, BusyHost, DialogHost, notify, ToastHost } from '../components/ui';
import { restoreBackup } from '../lib/backup';
import { boot, setup, useMe } from '../lib/boot';
import { usePrivacy } from '../lib/privacy';
import { DISPLAY, useT } from '../lib/theme';
import { Mark } from '../components/Mark';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold, useFonts } from '@expo-google-fonts/space-grotesk';

const ease = Easing.out(Easing.cubic);

function Welcome() {
  const t = useT();
  const ins = useSafeAreaInsets();
  const [working, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      await setup();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  const restore = async () => {
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (r.canceled) return;
    ask(
      'Backup password',
      'Enter the password used when the backup was made.',
      'Restore',
      (pw) =>
        busy('Restoring…', async () => {
          await restoreBackup(new File(r.assets[0].uri), pw);
          await boot();
        }).catch((e) =>
          notify(
            'Couldn’t restore',
            e?.message === 'wrong password'
              ? 'That password doesn’t match this backup.'
              : e?.message === 'not a backup'
                ? 'This isn’t a PING backup file.'
                : 'Check your internet connection and try again.',
          ),
        ),
      { secure: true },
    );
  };
  const points: [keyof typeof Ionicons.glyphMap, string, string][] = [
    ['finger-print-outline', 'No number, no name', 'Connect with a private code or QR. Nothing about you is stored.'],
    ['lock-closed-outline', 'End-to-end encrypted', 'Only the two phones can read a message. The relay sees noise.'],
    ['timer-outline', 'Messages that disappear', 'After seen, 24 hours, 48 hours, a week or a month.'],
  ];
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: ins.top + 60, paddingBottom: ins.bottom + 24, paddingHorizontal: 26 }}>
      <Animated.View entering={FadeInDown.duration(600).easing(ease)}>
        <View style={{ marginBottom: 28 }}>
          <Mark size={72} />
        </View>
        <Text style={{ color: t.text, fontSize: 58, fontFamily: DISPLAY, letterSpacing: -2.5, lineHeight: 62 }}>PING</Text>
        <Text style={{ color: t.sub, fontSize: 17, lineHeight: 24, marginTop: 6 }}>Private chat for your people. Fast, quiet, yours.</Text>
      </Animated.View>
      <View style={{ gap: 22, marginTop: 44, flex: 1 }}>
        {points.map(([icon, title, text], i) => (
          <Animated.View
            key={title}
            entering={FadeInDown.delay(200 + i * 110)
              .duration(500)
              .easing(ease)}
            style={{ flexDirection: 'row', gap: 16 }}
          >
            <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: t.accentDim, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={icon} size={21} color={t.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 16.5, fontWeight: '800' }}>{title}</Text>
              <Text style={{ color: t.sub, fontSize: 14, lineHeight: 20, marginTop: 2 }}>{text}</Text>
            </View>
          </Animated.View>
        ))}
      </View>
      <Animated.View entering={FadeIn.delay(600).duration(400)} style={{ gap: 12 }}>
        {!!err && <Text style={{ color: t.red, textAlign: 'center' }}>Couldn’t connect. Check your internet and try again.</Text>}
        {working ? (
          <ActivityIndicator color={t.accent} style={{ height: 52 }} />
        ) : (
          <>
            <Btn label={err ? 'Try again' : 'Get started'} onPress={go} />
            <Btn label="Restore from backup" kind="ghost" onPress={restore} />
          </>
        )}
      </Animated.View>
    </View>
  );
}

export default function Root() {
  const t = useT();
  const state = useMe((m) => m.state);
  const noShots = usePrivacy((p) => p.noScreenshots);
  const lastTap = Notifications.useLastNotificationResponse();
  const [fonts] = useFonts({ SpaceGrotesk_700Bold, SpaceGrotesk_600SemiBold });

  useEffect(() => {
    boot();
  }, []);
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(t.bg);
  }, [t]);
  useEffect(() => {
    (noShots ? ScreenCapture.preventScreenCaptureAsync('ping') : ScreenCapture.allowScreenCaptureAsync('ping')).catch(() => {});
  }, [noShots]);
  useEffect(() => {
    const data = lastTap?.notification.request.content.data;
    if (state === 'ready' && typeof data?.chat === 'string')
      router.push({ pathname: '/chat/[id]', params: { id: data.chat, ...(typeof data.jump === 'string' ? { jump: data.jump } : {}) } });
  }, [lastTap, state]);

  const base = t.dark ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: t.bg, card: t.bg, primary: t.accent, text: t.text, border: t.line } };
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardProvider>
        <ThemeProvider value={theme}>
          <StatusBar style={t.dark ? 'light' : 'dark'} />
          {!fonts ? (
            <View style={{ flex: 1, backgroundColor: t.bg }} />
          ) : state === 'ready' ? (
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: 'ios_from_right' }}>
              <Stack.Screen name="index" options={{ animation: 'fade' }} />
              <Stack.Screen name="add" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="read/[id]" options={{ animation: 'fade_from_bottom' }} />
              <Stack.Screen name="media/[id]" options={{ animation: 'fade', contentStyle: { backgroundColor: '#000' } }} />
              <Stack.Screen name="story/[id]" options={{ animation: 'fade', contentStyle: { backgroundColor: '#000' } }} />
              <Stack.Screen name="story/new" options={{ animation: 'slide_from_bottom', contentStyle: { backgroundColor: '#000' } }} />
              <Stack.Screen name="play" options={{ animation: 'fade_from_bottom', contentStyle: { backgroundColor: '#000' } }} />
              <Stack.Screen name="call/[id]" options={{ animation: 'fade', gestureEnabled: false, contentStyle: { backgroundColor: '#05060A' } }} />
            </Stack>
          ) : state === 'welcome' ? (
            <Welcome />
          ) : (
            <View style={{ flex: 1, backgroundColor: t.bg }} />
          )}
          <ToastHost />
          <BusyHost />
          <DialogHost />
          <AppLockHost />
        </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
