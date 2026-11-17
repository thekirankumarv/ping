import { create } from 'zustand';
import { startCalls } from './call';
import * as core from './core';
import { sql, wipeLocal } from './db';
import { forgetKeys, loadKeys } from './identity';
import { startMedia, wipeMedia } from './media';
import { readPrefs, writePrefs } from './prefs';
import { registerPush } from './push';
import { deleteAccount, regenerateCode, register, savedIdent, start } from './relay';

type Me = { state: 'loading' | 'welcome' | 'ready'; uid: string; code: string; pub: string };
export const useMe = create<Me>()(() => ({ state: 'loading', uid: '', code: '', pub: '' }));

const PUSH = 'ping.push.json';
let secret: Uint8Array;

let started = false;
function go(uid: string, code: string, pub: string) {
  if (started) return useMe.setState({ state: 'ready', uid, code, pub });
  started = true;
  core.init(sql, { id: uid, secret, push: (readPrefs(PUSH).token as string) ?? null });
  core.ensureSelf(pub);
  start(uid);
  startMedia();
  startCalls();
  core.sweep();
  setInterval(core.sweep, 10_000);
  useMe.setState({ state: 'ready', uid, code, pub });
  registerPush().then((token) => {
    if (!token) return;
    writePrefs(PUSH, { token });
    core.setPush(token);
  });
}

// Returning users open straight from local data; the network catches up behind.
export async function boot() {
  const keys = await loadKeys();
  secret = keys.secret;
  const id = savedIdent();
  if (!id.uid || !id.code) return useMe.setState({ state: 'welcome', pub: keys.pub });
  go(id.uid, id.code, keys.pub);
  register(keys.pub)
    .then((r) => useMe.setState({ code: r.code }))
    .catch(() => {});
}

export async function setup() {
  const { pub } = useMe.getState();
  const r = await register(pub);
  go(r.uid, r.code, pub);
}

export async function newCode() {
  const code = await regenerateCode(useMe.getState().pub);
  useMe.setState({ code });
  return code;
}

// Panic wipe: chats, keys and the relay account. Cannot be undone.
export async function wipeEverything() {
  await deleteAccount().catch(() => {});
  wipeLocal();
  wipeMedia();
  await forgetKeys();
  writePrefs(PUSH, {});
}
