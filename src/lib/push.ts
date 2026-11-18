import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidAudioContentType, AndroidAudioUsage, AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
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
    // Android takes sound from the channel, not the push, and plays it once: ring.mp3 is ~36s to cover the ring window.
    await Notifications.setNotificationChannelAsync('calls', {
      name: 'Calls',
      importance: AndroidImportance.MAX,
      sound: 'ring.mp3',
      audioAttributes: { usage: AndroidAudioUsage.NOTIFICATION_RINGTONE, contentType: AndroidAudioContentType.SONIFICATION },
      vibrationPattern: [0, 600, 900, 600, 900, 600, 900, 600],
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    });
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return null;
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}

// Content-free on purpose: the message itself stays encrypted in the relay.
export function sendPush(to: string | null | undefined, chat: string, body = 'New message', channelId = 'messages') {
  if (!to) return;
  fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ to, title: 'PING', body, channelId, priority: 'high', sound: 'default', data: { chat, call: channelId === 'calls' } }),
  }).catch(() => {});
}

// The native ringer (plugins/call-ring.js) posts the call alert; dismissing it stops the ringtone.
export const clearCallAlerts = () => Notifications.dismissNotificationAsync('expo-notifications://foreign_notifications?tag=ping-call&id=1').catch(() => {});

// Stops the closed phone ringing when the caller gives up first.
export function hushPush(to: string | null | undefined, chat: string) {
  if (!to) return;
  fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ to, priority: 'high', data: { chat, hush: true } }),
  }).catch(() => {});
}
