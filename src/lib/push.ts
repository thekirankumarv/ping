import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import { AppState } from 'react-native';

// No message banner while PING is open; realtime already shows it. Reminders always show.
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const quiet = AppState.currentState === 'active' && !n.request.content.data?.jump;
    return { shouldShowBanner: !quiet, shouldShowList: !quiet, shouldPlaySound: !quiet, shouldSetBadge: false };
  },
});

// Needs an EAS project id and Firebase credentials in the build; returns null until both exist.
export async function registerPush(): Promise<string | null> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return null;
  try {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 180, 120, 180],
      lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
    });
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return null;
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}

// Content-free on purpose: the message itself stays encrypted in the relay.
export function sendPush(to: string | null | undefined, chat: string) {
  if (!to) return;
  fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ to, title: 'PING', body: 'New message', channelId: 'messages', priority: 'high', sound: 'default', data: { chat } }),
  }).catch(() => {});
}
