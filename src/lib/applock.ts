import * as Auth from 'expo-local-authentication';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';
import { readPrefs, writePrefs } from './prefs';

const FILE = 'ping.applock.json';
export const GRACE_MS = 60_000;
export const lockSupported = Platform.OS !== 'web';

const on = lockSupported && readPrefs(FILE).on === true;
export const useAppLock = create<{ on: boolean; locked: boolean }>()(() => ({ on, locked: on }));

let awayAt: number | undefined;
let authing = false;

AppState.addEventListener('change', (st) => {
  if (authing || !useAppLock.getState().on) return;
  if (st === 'background') awayAt ??= Date.now();
  if (st === 'active') {
    if (awayAt !== undefined && Date.now() - awayAt >= GRACE_MS) useAppLock.setState({ locked: true });
    awayAt = undefined;
  }
});

const check = () => Auth.authenticateAsync({ promptMessage: 'Unlock PING', promptSubtitle: 'Use your fingerprint, face or screen lock' });

export async function unlock() {
  if (authing) return;
  authing = true;
  try {
    if ((await Auth.getEnrolledLevelAsync()) === Auth.SecurityLevel.NONE) return useAppLock.setState({ locked: false });
    if ((await check()).success) useAppLock.setState({ locked: false });
  } finally {
    authing = false;
    awayAt = undefined;
  }
}

export async function setAppLock(next: boolean): Promise<'ok' | 'none' | 'failed'> {
  if (next) {
    if ((await Auth.getEnrolledLevelAsync()) === Auth.SecurityLevel.NONE) return 'none';
    authing = true;
    try {
      if (!(await check()).success) return 'failed';
    } finally {
      authing = false;
      awayAt = undefined;
    }
  }
  writePrefs(FILE, { on: next });
  useAppLock.setState({ on: next, locked: false });
  return 'ok';
}
