import 'react-native-url-polyfill/auto';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { create } from 'zustand';
import * as core from './core';
import { newCode } from './crypto';
import { readPrefs, writePrefs } from './prefs';
import { usePrivacy } from './privacy';
import { sendPush } from './push';

const URL = 'https://watzdqfgjfrgljwlybbp.supabase.co';
const KEY = 'sb_publishable_k7wBnKK-l9xOlZIABUp9vQ_J_d8Jgy0';

const AUTH = 'ping.auth.json';
const storage = {
  getItem: (k: string) => (readPrefs(AUTH)[k] as string | undefined) ?? null,
  setItem: (k: string, v: string) => writePrefs(AUTH, { ...readPrefs(AUTH), [k]: v }),
  removeItem: (k: string) => {
    const p = readPrefs(AUTH);
    delete p[k];
    writePrefs(AUTH, p);
  },
};
const sb = createClient(URL, KEY, { auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });

type Net = {
  status: 'offline' | 'connecting' | 'online';
  online: Record<string, boolean>;
  typing: Record<string, boolean>;
  seen: Record<string, number | null>;
};
export const useNet = create<Net>()(() => ({ status: 'connecting', online: {}, typing: {}, seen: {} }));

export async function storageAuth() {
  const token = (await sb.auth.getSession()).data.session?.access_token;
  return { url: `${URL}/storage/v1/object`, headers: { authorization: `Bearer ${token}`, apikey: KEY } };
}
export const removeRemote = (path: string) => sb.storage.from('media').remove([path]);

// Identity

const ID = 'ping.id.json';
export type Ident = { uid: string; code: string };
export const savedIdent = () => readPrefs(ID) as Partial<Ident>;
export const session = () => readPrefs(AUTH);
export async function restoreIdent(id: Ident, auth: Record<string, unknown>) {
  writePrefs(AUTH, auth);
  for (const v of Object.values(auth)) {
    const s = typeof v === 'string' ? JSON.parse(v) : null;
    if (s?.refresh_token) {
      const { error } = await sb.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
      if (error) throw error;
    }
  }
  writePrefs(ID, id);
}

// First launch needs the network once: anonymous account plus a published code and public key.
export async function register(pub: string): Promise<Ident> {
  let session = (await sb.auth.getSession()).data.session;
  if (!session) {
    const r = await sb.auth.signInAnonymously();
    if (r.error) throw r.error;
    session = r.data.session!;
  }
  const uid = session.user.id;
  const cur = savedIdent();
  const code = await publish(uid, cur.uid === uid && cur.code ? cur.code : newCode(), pub);
  writePrefs(ID, { uid, code });
  return { uid, code };
}

async function publish(uid: string, code: string, pub: string) {
  for (let i = 0; i < 5; i++, code = newCode()) {
    const { error } = await sb.from('profiles').upsert({ id: uid, code, pub });
    if (!error) return code;
    if (error.code !== '23505') throw error;
  }
  throw new Error('Could not reserve a code');
}

export async function regenerateCode(pub: string) {
  const { uid } = savedIdent();
  const code = await publish(uid!, newCode(), pub);
  writePrefs(ID, { uid, code });
  return code;
}

export async function findCode(code: string) {
  const { data, error } = await sb.rpc('find_code', { c: code });
  if (error) throw error;
  return (data as { id: string; pub: string }[])[0];
}

// Delivery

const transport: core.Transport = {
  put: async (rows) => {
    if (!rows.length) return;
    const { error } = await sb.from('queue').insert(rows);
    if (error) throw error;
  },
  pubOf: async (id) => {
    const { data } = await sb.rpc('peers', { ids: [id] });
    return (data as { pub: string }[] | null)?.[0]?.pub;
  },
};

// One job at a time keeps events in order.
let chain: Promise<unknown> = Promise.resolve();
const serial = (f: () => Promise<unknown>) => (chain = chain.then(f).catch(() => {}));

let onReceived = () => {};
export const afterReceive = (f: () => void) => void (onReceived = f);

async function take(rows: core.Row[]) {
  if (!rows.length) return;
  await core.receive(rows, transport);
  onReceived();
  await sb
    .from('queue')
    .delete()
    .in(
      'id',
      rows.map((r) => r.id),
    );
}

async function drain() {
  for (;;) {
    const { data, error } = await sb.from('queue').select('id, sender, box').order('id').limit(100);
    if (error || !data?.length) return;
    await take(data);
    if (data.length < 100) return;
  }
}

export function flushSoon() {
  serial(async () => {
    const pinged = await core.flush(transport);
    const me = core.myId();
    for (const p of pinged) if (!useNet.getState().online[p]) sendPush(core.contact(p)?.push, me);
  });
}

// Presence and typing ride on one broadcast channel per contact.

const pairs = new Map<string, RealtimeChannel>();
let me = '';
const active = () => AppState.currentState === 'active';

function announce(ch: RealtimeChannel) {
  if (active() && !usePrivacy.getState().hideOnline) ch.track({});
  else ch.untrack();
}

function syncPairs() {
  const want = new Set(core.connected());
  for (const [id, ch] of pairs)
    if (!want.has(id)) {
      sb.removeChannel(ch);
      pairs.delete(id);
    }
  for (const id of want) {
    if (pairs.has(id)) continue;
    const ch = sb.channel(`pair:${[me, id].sort().join(':')}`, { config: { presence: { key: me }, broadcast: { self: false } } });
    ch.on('presence', { event: 'sync' }, () => {
      const on = id in ch.presenceState();
      const was = useNet.getState().online[id];
      useNet.setState((s) => ({ online: { ...s.online, [id]: on } }));
      if (was && !on) refreshSeen();
    })
      .on('broadcast', { event: 'typing' }, () => typing(id, true))
      .on('broadcast', { event: 'call' }, ({ payload }) => typeof payload?.box === 'string' && onSignal(id, payload.box))
      .subscribe((st) => st === 'SUBSCRIBED' && announce(ch));
    pairs.set(id, ch);
  }
}

const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
function typing(id: string, on: boolean) {
  clearTimeout(typingTimers.get(id));
  if (on)
    typingTimers.set(
      id,
      setTimeout(() => typing(id, false), 4000),
    );
  if (useNet.getState().typing[id] !== on) useNet.setState((s) => ({ typing: { ...s.typing, [id]: on } }));
}

// Call signalling: sealed with the pair key, delivered only while both apps are open.
let onSignal: (peer: string, box: string) => void = () => {};
export const handleSignals = (f: typeof onSignal) => void (onSignal = f);
export function signal(peer: string, box: string) {
  const ch = pairs.get(peer);
  if (!ch) return false;
  ch.send({ type: 'broadcast', event: 'call', payload: { box } });
  return true;
}

let lastTyping = 0;
export function sendTyping(peer: string) {
  if (Date.now() - lastTyping < 2500) return;
  lastTyping = Date.now();
  pairs.get(peer)?.send({ type: 'broadcast', event: 'typing', payload: {} });
}

export async function refreshSeen() {
  const ids = core.connected();
  if (!ids.length) return;
  const { data } = await sb.rpc('peers', { ids });
  if (!data) return;
  const seen: Record<string, number | null> = {};
  for (const p of data as { id: string; seen_at: string | null }[]) seen[p.id] = p.seen_at ? Date.parse(p.seen_at) : null;
  useNet.setState({ seen });
}

function heartbeat() {
  sb.from('profiles')
    .update({ seen_at: usePrivacy.getState().hideOnline ? null : new Date().toISOString() })
    .eq('id', me)
    .then(() => {});
}

export function applyPrivacy() {
  pairs.forEach(announce);
  heartbeat();
}

export function start(uid: string) {
  me = uid;
  core.onOutbox(flushSoon);
  sb.channel(`inbox:${uid}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'queue', filter: `recipient=eq.${uid}` }, (p) =>
      serial(() => take([p.new as core.Row])),
    )
    .subscribe((st) => {
      if (st === 'SUBSCRIBED') {
        useNet.setState({ status: 'online' });
        serial(drain);
        // Realtime starts delivering about a second after SUBSCRIBED; catch rows sent in that gap.
        setTimeout(() => serial(drain), 2500);
        flushSoon();
        refreshSeen();
      } else useNet.setState({ status: st === 'CLOSED' ? 'offline' : 'connecting' });
    });
  syncPairs();
  core.onChange(syncPairs);
  heartbeat();
  AppState.addEventListener('change', (st) => {
    if (st === 'active') {
      sb.auth.startAutoRefresh();
      serial(drain);
      flushSoon();
      refreshSeen();
    } else sb.auth.stopAutoRefresh();
    if (st === 'active' || st === 'background') {
      pairs.forEach(announce);
      heartbeat();
    }
  });
  // Retries unsent events and picks up anything realtime missed.
  setInterval(() => {
    if (!active()) return;
    flushSoon();
    serial(drain);
  }, 15_000);
}

export async function deleteAccount() {
  await sb.from('profiles').delete().eq('id', me);
  await sb.auth.signOut();
  writePrefs(ID, {});
  writePrefs(AUTH, {});
}

export function usePeer(id: string) {
  const online = useNet((s) => !!s.online[id]);
  const typing = useNet((s) => !!s.typing[id]);
  const seen = useNet((s) => s.seen[id] ?? null);
  return { online, typing, seen };
}
