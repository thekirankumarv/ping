import * as Notifications from 'expo-notifications';
import { AndroidImportance, SchedulableTriggerInputTypes } from 'expo-notifications';
import * as core from './core';

// Local only: nothing leaves the phone, so it works without push set up.
export async function remind(m: core.Msg, at: number) {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;
  await Notifications.setNotificationChannelAsync('reminders', { name: 'Reminders', importance: AndroidImportance.HIGH });
  const who = m.mine ? 'You' : (core.contact(m.chat)?.label ?? 'PING');
  await Notifications.scheduleNotificationAsync({
    content: { title: `Reminder · ${who}`, body: core.summary(m).slice(0, 180), data: { chat: m.chat, jump: m.id } },
    trigger: { type: SchedulableTriggerInputTypes.DATE, date: at, channelId: 'reminders' },
  });
  return true;
}
