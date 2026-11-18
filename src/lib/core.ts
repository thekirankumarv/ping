// Chat engine: local SQLite state plus the encrypted event protocol. No RN imports, so the two-phone test runs under tsx.
import { open, randomBytes, seal, sharedKey, unb64 } from './crypto';
import { plain, toggleTask } from './md';
import { duration, ttlLabel } from './time';

export type Sql = {
  exec(sql: string): void;
  run(sql: string, ...args: (string | number | null)[]): void;
  all<T>(sql: string, ...args: (string | number | null)[]): T[];
  get<T>(sql: string, ...args: (string | number | null)[]): T | undefined;
};

// out: I sent a request. in: they sent one. ok: connected.
export type ContactState = 'out' | 'in' | 'ok' | 'blocked';
export type Contact = {
  id: string;
  label: string;
  pub: string;
  push: string | null;
  state: ContactState;
  ttl: number;
  created: number;
  draft: string | null;
  theme: string | null;
  wall: string | null;
  shots: 0 | 1;
  hide: 0 | 1;
};
export type Kind = 'text' | 'sys' | 'call' | 'image' | 'file' | 'voice';
export type Link = { url: string; title?: string; desc?: string; site?: string; thumb?: string };
export type Meta = {
  name?: string;
  mime?: string;
  size?: number;
  w?: number;
  h?: number;
  dur?: number;
  wave?: number[];
  thumb?: string;
  // Remote copy, until the recipient has downloaded it.
  path?: string;
  key?: string;
  local?: string;
  opened?: boolean;
  views?: number;
  failed?: boolean;
  cleared?: boolean;
  link?: Link;
  bg?: string;
};
// status: 0 sending, 1 sent, 2 delivered, 3 read.
export type Msg = {
  id: string;
  chat: string;
  mine: 0 | 1;
  kind: Kind;
  body: string;
  reply: string | null;
  status: 0 | 1 | 2 | 3;
  edited: number | null;
  ttl: number;
  exp: number | null;
  ts: number;
  gone: 0 | 1;
  reacts: string;
  star: 0 | 1;
  meta: string | null;
  // Views allowed: 0 unlimited, 1 view once, 2 view twice.
  once: 0 | 1 | 2;
  pin: 0 | 1;
};

type Wire = { kind?: Kind; meta?: Meta; once?: 1 | 2; quiet?: 1 };
export type Ev =
  | { t: 'hi'; push?: string | null }
  | { t: 'ok'; push?: string | null }
  | ({ t: 'm'; id: string; body: string; reply?: string | null; ttl: number; ts: number } & Wire)
  | { t: 'e'; id: string; body: string; ts: number }
  | { t: 'd'; id: string }
  | { t: 'r'; id: string; e: string }
  | { t: 's'; ids: string[]; s: 2 | 3 }
  | { t: 'c'; id: string; line: number; done: boolean }
  | { t: 'o'; id: string }
  | { t: 'p'; id: string; on: boolean }
  | { t: 'lp'; id: string; link: Link }
  | { t: 'ttl'; ttl: number }
  | { t: 'push'; push: string | null }
  | { t: 'st'; id: string; kind: StoryKind; body: string; meta: Meta; ts: number; exp: number }
  | { t: 'sv'; id: string }
  | { t: 'sd'; id: string };

export type StoryKind = 'image' | 'text';
export type Story = { id: string; author: string; kind: StoryKind; body: string; meta: string | null; ts: number; exp: number; seen: 0 | 1 };
export const STORIES = 'stories';
const DAY = 86_400_000;

export type Transport = {
  put(rows: { recipient: string; box: string }[]): Promise<void>;
  pubOf(id: string): Promise<string | undefined>;
};
export type Row = { id: number; sender: string; box: string };

const SCHEMA = `
create table if not exists contacts (
  id text primary key, label text not null, pub text not null, push text,
  state text not null, ttl integer not null default 0, created integer not null, draft text
);
create table if not exists messages (
  id text primary key, chat text not null, mine integer not null, kind text not null default 'text',
  body text not null, reply text, status integer not null default 0, edited integer,
  ttl integer not null default 0, exp integer, ts integer not null, gone integer not null default 0,
  reacts text not null default '{}', star integer not null default 0
);
create index if not exists messages_chat on messages (chat, ts);
create table if not exists outbox (id integer primary key autoincrement, peer text not null, ev text not null);
create table if not exists stories (
  id text primary key, author text not null, kind text not null, body text not null default '', meta text,
  ts integer not null, exp integer not null, seen integer not null default 0
);
create table if not exists views (story text not null, viewer text not null, ts integer not null, primary key (story, viewer));
`;
const COLUMNS: Record<string, [string, string][]> = {
  contacts: [
    ['theme', 'text'],
    ['wall', 'text'],
    ['shots', 'integer not null default 0'],
    ['hide', 'integer not null default 0'],
  ],
  messages: [
    ['meta', 'text'],
    ['once', 'integer not null default 0'],
    ['pin', 'integer not null default 0'],
  ],
  outbox: [
    ['due', 'integer'],
    ['mid', 'text'],
  ],
};

let db: Sql;
let me: { id: string; secret: Uint8Array; push: string | null };
const keys = new Map<string, Uint8Array>();
let clock = () => Date.now();
export const setClock = (f: () => number) => void (clock = f);

const listeners = new Set<(chat: string) => void>();
export function onChange(f: (chat: string) => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}
const changed = (chat: string) => listeners.forEach((f) => f(chat));
let kick = () => {};
export const onOutbox = (f: () => void) => void (kick = f);

export function init(sql: Sql, self: { id: string; secret: Uint8Array; push?: string | null }) {
  db = sql;
  me = { ...self, push: self.push ?? null };
  keys.clear();
  db.exec(SCHEMA);
  for (const [table, cols] of Object.entries(COLUMNS)) {
    const have = new Set(db.all<{ name: string }>(`pragma table_info(${table})`).map((c) => c.name));
    for (const [name, type] of cols) if (!have.has(name)) db.exec(`alter table ${table} add column ${name} ${type}`);
  }
}
export const myId = () => me.id;
export const isSelf = (chat: string) => chat === me.id;

const newId = () => Array.from(randomBytes(12), (b) => b.toString(16).padStart(2, '0')).join('');
function keyFor(peer: string, pub?: string) {
  let k = keys.get(peer);
  if (!k) {
    const p = pub ?? contact(peer)?.pub;
    if (!p) throw new Error('Unknown contact');
    keys.set(peer, (k = sharedKey(me.secret, unb64(p))));
  }
  return k;
}
function send(peer: string, ev: Ev, due?: number) {
  if (peer === me.id) return;
  db.run('insert into outbox (peer, ev, due, mid) values (?, ?, ?, ?)', peer, JSON.stringify(ev), due ?? null, 'id' in ev ? ev.id : null);
  kick();
}

// Signalling for calls rides outside the queue but under the same key.
export const sealFor = (peer: string, v: unknown) => seal(keyFor(peer), v);
export const openFrom = <T>(peer: string, box: string) => open<T>(keyFor(peer), box);

export const metaOf = (m: Pick<Msg, 'meta'>): Meta => (m.meta ? JSON.parse(m.meta) : {});
function patchMeta(id: string, patch: Partial<Meta>) {
  const m = message(id);
  if (!m) return;
  const next = { ...metaOf(m), ...patch };
  for (const k of Object.keys(patch) as (keyof Meta)[]) if (patch[k] === undefined) delete next[k];
  db.run('update messages set meta = ? where id = ?', JSON.stringify(next), id);
  changed(m.chat);
}

// Queries

export const contact = (id: string) => db.get<Contact>('select * from contacts where id = ?', id);
export const message = (id: string) => db.get<Msg>('select * from messages where id = ?', id);
export const messages = (chat: string) => db.all<Msg>('select * from messages where chat = ? order by ts desc, rowid desc', chat);
export const unread = (chat: string) => db.get<{ n: number }>('select count(*) n from messages where chat = ? and mine = 0 and status < 3', chat)!.n;

export type ChatRow = Contact & { last: Msg | null; unread: number };
export function chats(): ChatRow[] {
  const cs = db.all<Contact>("select * from contacts where state != 'blocked'");
  return cs
    .map((c) => ({ ...c, last: db.get<Msg>('select * from messages where chat = ? order by ts desc, rowid desc limit 1', c.id) ?? null, unread: unread(c.id) }))
    .sort((a, b) => (b.last?.ts ?? b.created) - (a.last?.ts ?? a.created));
}
// Who gets new stories: connected contacts not hidden from them.
export const storyAudience = () => connected().filter((id) => !contact(id)?.hide);
export function setStoryHidden(id: string, hide: boolean) {
  db.run('update contacts set hide = ? where id = ?', hide ? 1 : 0, id);
  changed(id);
}
export const connected = () => db.all<{ id: string }>("select id from contacts where state = 'ok' and id != ?", me.id).map((r) => r.id);
export const blocked = () => db.all<Contact>("select * from contacts where state = 'blocked'");
export const starred = (chat: string) => db.all<Msg>('select * from messages where chat = ? and star = 1 order by ts desc', chat);
export const pinned = (chat: string) => db.all<Msg>('select * from messages where chat = ? and pin = 1 and gone = 0 order by ts desc', chat);
export const media = (chat: string) =>
  db.all<Msg>("select * from messages where chat = ? and kind in ('image', 'file', 'voice') and gone = 0 and once = 0 order by ts desc", chat);
export const links = (chat: string) =>
  db.all<Msg>("select * from messages where chat = ? and kind = 'text' and gone = 0 and body like '%http%' order by ts desc", chat);
export const search = (q: string) => {
  const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  return db.all<Msg>(
    "select * from messages where kind not in ('sys', 'call') and gone = 0 and once = 0 and (body like ?1 escape '\\' or (kind = 'file' and meta like ?1 escape '\\')) order by ts desc limit 100",
    like,
  );
};
export const scheduled = (chat: string) => db.all<{ mid: string; due: number }>('select mid, due from outbox where peer = ? and due is not null', chat);

// Files this database still points at; anything else in the media folder can go.
export function localFiles() {
  const out = new Set<string>();
  for (const r of db.all<{ meta: string }>(
    'select meta from messages where meta like \'%"local":%\' union all select meta from stories where meta like \'%"local":%\'',
  )) {
    const l = JSON.parse(r.meta).local;
    if (l) out.add(l);
  }
  return out;
}
export const unshipped = () =>
  db.all<Msg>(
    "select * from messages where mine = 1 and status = 0 and gone = 0 and kind in ('image', 'file', 'voice') and id not in (select mid from outbox where mid is not null)",
  );
export const toFetch = () => db.all<Msg>('select * from messages where mine = 0 and gone = 0 and meta like \'%"path":%\'');
export function usage() {
  const by = new Map<string, { bytes: number; count: number }>();
  for (const m of db.all<Msg>('select chat, meta from messages where meta like \'%"local":%\'')) {
    const u = by.get(m.chat) ?? { bytes: 0, count: 0 };
    u.bytes += metaOf(m).size ?? 0;
    u.count++;
    by.set(m.chat, u);
  }
  return by;
}

export function summary(m: Msg) {
  if (m.gone) return 'Deleted message';
  const x = metaOf(m);
  const cap = m.body ? ` · ${plain(m.body)}` : '';
  switch (m.kind) {
    case 'image':
      return m.once ? `📷 View ${m.once === 2 ? 'twice' : 'once'} photo` : `📷 Photo${cap}`;
    case 'file':
      return `📄 ${x.name ?? 'File'}${cap}`;
    case 'voice':
      return `🎤 Voice message (${duration(x.dur ?? 0)})`;
    default:
      return plain(m.body);
  }
}

// Contacts

export function ensureSelf(pub: string) {
  if (!contact(me.id)) db.run("insert into contacts (id, label, pub, state, created) values (?, 'Notes to self', ?, 'ok', ?)", me.id, pub, clock());
}

export function addContact(id: string, pub: string, label: string) {
  const c = contact(id);
  if (c?.state === 'ok') return 'exists';
  if (c?.state === 'in') {
    accept(id, label);
    return 'connected';
  }
  if (c) db.run("update contacts set label = ?, pub = ?, state = 'out' where id = ?", label, pub, id);
  else db.run("insert into contacts (id, label, pub, state, created) values (?, ?, ?, 'out', ?)", id, label, pub, clock());
  keys.delete(id);
  send(id, { t: 'hi', push: me.push });
  changed(id);
  return 'sent';
}
export function accept(id: string, label?: string) {
  db.run("update contacts set state = 'ok', label = coalesce(?, label) where id = ?", label ?? null, id);
  send(id, { t: 'ok', push: me.push });
  changed(id);
}
export function rename(id: string, label: string) {
  db.run('update contacts set label = ? where id = ?', label, id);
  changed(id);
}
export function block(id: string) {
  db.run("update contacts set state = 'blocked' where id = ?", id);
  changed(id);
}
export function unblock(id: string) {
  db.run("update contacts set state = 'ok' where id = ?", id);
  changed(id);
}
export function removeContact(id: string) {
  db.run('delete from messages where chat = ?', id);
  db.run('delete from stories where author = ?', id);
  db.run('delete from contacts where id = ?', id);
  db.run('delete from outbox where peer = ?', id);
  keys.delete(id);
  changed(id);
}
export function clearChat(id: string) {
  db.run('delete from messages where chat = ?', id);
  db.run('delete from outbox where peer = ? and due is not null', id);
  changed(id);
}
export function clearMedia(chat: string) {
  for (const m of db.all<Msg>('select * from messages where chat = ? and meta like \'%"local":%\'', chat)) patchMeta(m.id, { local: undefined, cleared: true });
}
export function setDraft(id: string, draft: string) {
  db.run('update contacts set draft = ? where id = ?', draft || null, id);
}
export function setChatLook(id: string, look: { theme?: string | null; wall?: string | null; shots?: 0 | 1 }) {
  const c = contact(id);
  if (!c) return;
  db.run(
    'update contacts set theme = ?, wall = ?, shots = ? where id = ?',
    look.theme !== undefined ? look.theme : c.theme,
    look.wall !== undefined ? look.wall : c.wall,
    look.shots ?? c.shots,
    id,
  );
  changed(id);
}
export function setPush(push: string | null) {
  if (push === me.push) return;
  me.push = push;
  for (const id of connected()) send(id, { t: 'push', push });
}

// Messages

function sys(chat: string, body: string, kind: Kind = 'sys', mine = 0) {
  db.run('insert into messages (id, chat, mine, kind, body, status, ts) values (?, ?, ?, ?, ?, 3, ?)', newId(), chat, mine, kind, body, clock());
  changed(chat);
}
export const logCall = (chat: string, body: string, mine: boolean) => sys(chat, body, 'call', mine ? 1 : 0);

type SendOpts = { reply?: string | null; ttl?: number; quiet?: boolean; at?: number; once?: 0 | 1 | 2 };

function insertMine(chat: string, kind: Kind, body: string, meta: Meta | null, o: SendOpts) {
  const c = contact(chat);
  if (c?.state !== 'ok') return;
  const self = isSelf(chat);
  const m = { id: newId(), body, reply: o.reply ?? null, ttl: self ? 0 : (o.ttl ?? c.ttl), ts: o.at ?? clock() };
  db.run(
    'insert into messages (id, chat, mine, kind, body, reply, ttl, ts, status, meta, once) values (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)',
    m.id,
    chat,
    kind,
    body,
    m.reply,
    m.ttl,
    m.ts,
    self ? 3 : 0,
    meta ? JSON.stringify(meta) : null,
    o.once ?? 0,
  );
  return m;
}

export function sendText(chat: string, body: string, o: SendOpts = {}) {
  if (!body.trim()) return;
  const m = insertMine(chat, 'text', body, null, o);
  if (!m) return;
  send(chat, { t: 'm', ...m, ...(o.quiet ? { quiet: 1 } : {}) }, o.at);
  setDraft(chat, '');
  changed(chat);
  return m.id;
}

// Media shows at once from the local file; the event goes out after the upload.
export function addMedia(chat: string, kind: Kind, meta: Meta, o: SendOpts & { body?: string } = {}) {
  const m = insertMine(chat, kind, o.body ?? '', meta, o);
  if (!m) return;
  changed(chat);
  return m.id;
}
export function shipMedia(id: string, remote: { path: string; key: string }, quiet?: boolean) {
  const m = message(id);
  if (!m?.mine || m.gone) return;
  const { local: _, failed: __, ...meta } = metaOf(m);
  if (m.once) patchMeta(id, { local: undefined, failed: undefined });
  else patchMeta(id, { failed: undefined });
  send(m.chat, {
    t: 'm',
    id,
    body: m.body,
    reply: m.reply,
    ttl: m.ttl,
    ts: m.ts,
    kind: m.kind,
    meta: { ...meta, ...remote },
    ...(m.once ? { once: m.once } : {}),
    ...(quiet ? { quiet: 1 as const } : {}),
  });
}
export const mediaFailed = (id: string) => patchMeta(id, { failed: true });
export const setLocal = (id: string, local: string) => patchMeta(id, { local, path: undefined, key: undefined });

export function setLink(id: string, link: Link) {
  const m = message(id);
  if (!m?.mine || m.gone) return;
  patchMeta(id, { link });
  send(m.chat, { t: 'lp', id, link });
}

export function openOnce(id: string) {
  const m = message(id);
  const x = m && metaOf(m);
  if (!m?.once || m.mine || x!.opened) return;
  const views = (x!.views ?? 0) + 1;
  if (views < m.once) return patchMeta(id, { views });
  patchMeta(id, { local: undefined, thumb: undefined, opened: true, views });
  send(m.chat, { t: 'o', id });
}

export function edit(id: string, body: string) {
  const m = message(id);
  if (!m?.mine || m.gone || (!body.trim() && m.kind === 'text') || body === m.body) return;
  const ts = clock();
  db.run('update messages set body = ?, edited = ? where id = ?', body, ts, id);
  send(m.chat, { t: 'e', id, body, ts });
  changed(m.chat);
}

export function deleteForMe(ids: string[]) {
  const chats = new Set<string>();
  for (const id of ids) {
    const m = message(id);
    if (!m) continue;
    db.run('delete from messages where id = ?', id);
    db.run('delete from outbox where mid = ? and due is not null', id);
    chats.add(m.chat);
  }
  chats.forEach(changed);
}

export function deleteForEveryone(id: string) {
  const m = message(id);
  if (!m?.mine || m.gone) return;
  db.run("update messages set gone = 1, body = '', reacts = '{}', meta = null, pin = 0 where id = ?", id);
  send(m.chat, { t: 'd', id });
  changed(m.chat);
}

export function react(id: string, e: string) {
  const m = message(id);
  if (!m || m.gone) return;
  const r = JSON.parse(m.reacts);
  const next = r[me.id] === e ? '' : e;
  if (next) r[me.id] = next;
  else delete r[me.id];
  db.run('update messages set reacts = ? where id = ?', JSON.stringify(r), id);
  send(m.chat, { t: 'r', id, e: next });
  changed(m.chat);
}

export function toggleCheck(id: string, line: number, done: boolean) {
  const m = message(id);
  if (!m || m.gone) return;
  db.run('update messages set body = ? where id = ?', toggleTask(m.body, line, done), id);
  send(m.chat, { t: 'c', id, line, done });
  changed(m.chat);
}

export function star(id: string) {
  const m = message(id);
  if (!m) return;
  db.run('update messages set star = 1 - star where id = ?', id);
  changed(m.chat);
}

export function pin(id: string) {
  const m = message(id);
  if (!m || m.gone) return;
  const on = !m.pin;
  db.run('update messages set pin = ? where id = ?', on ? 1 : 0, id);
  send(m.chat, { t: 'p', id, on });
  changed(m.chat);
}

export function setTtl(chat: string, ttl: number) {
  db.run('update contacts set ttl = ? where id = ?', ttl, chat);
  sys(chat, ttl ? `You set disappearing messages to ${ttlLabel(ttl)}` : 'You turned off disappearing messages');
  send(chat, { t: 'ttl', ttl });
}

// Called while the chat is on screen. Timers start here for incoming messages.
export function markRead(chat: string) {
  const rows = db.all<Msg>('select * from messages where chat = ? and mine = 0 and status < 3', chat);
  if (!rows.length) return;
  const now = clock();
  for (const m of rows) db.run('update messages set status = 3, exp = ? where id = ?', m.ttl > 0 ? now + m.ttl * 1000 : null, m.id);
  const ids = rows.filter((m) => m.kind !== 'sys' && m.kind !== 'call').map((m) => m.id);
  if (ids.length) send(chat, { t: 's', ids, s: 3 });
  changed(chat);
}

// "After seen" messages go once the reader leaves the chat.
export function leave(chat: string) {
  db.run('delete from messages where chat = ? and mine = 0 and ttl = -1 and status = 3', chat);
  changed(chat);
}

export function sweep() {
  if (db.get('select 1 from stories where exp <= ?', clock())) {
    db.run('delete from views where story in (select id from stories where exp <= ?)', clock());
    db.run('delete from stories where exp <= ?', clock());
    changed(STORIES);
  }
  const gone = db.all<{ chat: string }>('select distinct chat from messages where exp is not null and exp <= ?', clock());
  if (!gone.length) return;
  db.run('delete from messages where exp is not null and exp <= ?', clock());
  gone.forEach((g) => changed(g.chat));
}

// Stories: 24 hours, sent to every connected contact; viewers report back.

export const activeStories = () => db.all<Story>('select * from stories where exp > ? order by ts', clock());
export function storyRing(author: string): 'new' | 'seen' | null {
  const r = db.get<{ n: number; unseen: number }>('select count(*) n, sum(seen = 0) unseen from stories where author = ? and exp > ?', author, clock())!;
  if (!r.n) return null;
  return author !== me.id && r.unseen ? 'new' : 'seen';
}
export const storiesOf = (author: string) => db.all<Story>('select * from stories where author = ? and exp > ? order by ts', author, clock());
export const viewers = (story: string) => db.all<{ viewer: string; ts: number }>('select viewer, ts from views where story = ? order by ts desc', story);
export const storiesToFetch = () => db.all<Story>('select * from stories where author != ? and meta like \'%"path":%\'', me.id);
export const storyMeta = (s: Pick<Story, 'meta'>): Meta => (s.meta ? JSON.parse(s.meta) : {});

export function addStory(kind: StoryKind, body: string, meta: Meta) {
  const id = newId();
  const ts = clock();
  db.run(
    'insert into stories (id, author, kind, body, meta, ts, exp, seen) values (?, ?, ?, ?, ?, ?, ?, 1)',
    id,
    me.id,
    kind,
    body,
    JSON.stringify(meta),
    ts,
    ts + DAY,
  );
  if (kind === 'text') for (const peer of storyAudience()) shipStory(id, peer);
  changed(STORIES);
  return id;
}
export function shipStory(id: string, peer: string, remote?: { path: string; key: string }) {
  const st = db.get<Story>('select * from stories where id = ? and author = ?', id, me.id);
  if (!st) return;
  const { local: _, ...meta } = storyMeta(st);
  send(peer, { t: 'st', id, kind: st.kind, body: st.body, meta: { ...meta, ...remote }, ts: st.ts, exp: st.exp });
}
export function setStoryLocal(id: string, local: string) {
  const st = db.get<Story>('select * from stories where id = ?', id);
  if (!st) return;
  const { path: _, key: __, ...meta } = storyMeta(st);
  db.run('update stories set meta = ? where id = ?', JSON.stringify({ ...meta, local }), id);
  changed(STORIES);
}
export function viewStory(id: string) {
  const st = db.get<Story>('select * from stories where id = ?', id);
  if (!st || st.seen) return;
  db.run('update stories set seen = 1 where id = ?', id);
  send(st.author, { t: 'sv', id });
  changed(STORIES);
}
export function deleteStory(id: string) {
  db.run('delete from stories where id = ? and author = ?', id, me.id);
  db.run('delete from views where story = ?', id);
  for (const peer of connected()) send(peer, { t: 'sd', id });
  changed(STORIES);
}

// Wire

// Sends due events; returns peers that got a new message (for push).
let flushing = false;
export async function flush(tr: Transport): Promise<string[]> {
  if (flushing) return [];
  flushing = true;
  const pinged = new Set<string>();
  try {
    for (;;) {
      const rows = db.all<{ id: number; peer: string; ev: string }>('select * from outbox where due is null or due <= ? order by id limit 50', clock());
      if (!rows.length) break;
      const out: { recipient: string; box: string }[] = [];
      for (const r of rows) {
        try {
          out.push({ recipient: r.peer, box: seal(keyFor(r.peer), JSON.parse(r.ev)) });
        } catch {} // contact removed meanwhile
      }
      await tr.put(out);
      db.run(`delete from outbox where id in (${rows.map((r) => r.id).join(',')})`);
      for (const r of rows) {
        const ev: Ev = JSON.parse(r.ev);
        if (ev.t !== 'm') continue;
        if (!ev.quiet) pinged.add(r.peer);
        db.run('update messages set status = 1 where id = ? and status = 0', ev.id);
        changed(r.peer);
      }
    }
  } finally {
    flushing = false;
  }
  return [...pinged];
}

// Applies downloaded rows; every row is consumed, including ones that fail to open.
export async function receive(rows: Row[], tr: Transport) {
  const delivered = new Map<string, string[]>();
  for (const row of rows) {
    const c = contact(row.sender);
    if (c?.state === 'blocked') continue;
    const pub = c?.pub ?? (await tr.pubOf(row.sender));
    if (!pub) continue;
    let ev: Ev;
    try {
      ev = open<Ev>(keyFor(row.sender, pub), row.box);
    } catch {
      continue;
    }
    const id = apply(row.sender, pub, ev);
    if (id) delivered.set(row.sender, [...(delivered.get(row.sender) ?? []), id]);
  }
  for (const [peer, ids] of delivered) send(peer, { t: 's', ids, s: 2 });
}

const KINDS: Kind[] = ['text', 'image', 'file', 'voice'];

function apply(from: string, pub: string, ev: Ev): string | void {
  const c = contact(from);
  if (ev.t === 'hi') {
    if (!c) db.run("insert into contacts (id, label, pub, push, state, created) values (?, 'New contact', ?, ?, 'in', ?)", from, pub, ev.push ?? null, clock());
    else if (c.state === 'out' || c.state === 'ok') {
      db.run("update contacts set state = 'ok', push = ? where id = ?", ev.push ?? c.push, from);
      send(from, { t: 'ok', push: me.push });
    }
    return changed(from);
  }
  if (!c) return;
  if (ev.t === 'ok') {
    if (c.state === 'out' || c.state === 'ok') db.run("update contacts set state = 'ok', push = ? where id = ?", ev.push ?? c.push, from);
    return changed(from);
  }
  if (c.state !== 'ok') return;
  const m = 'id' in ev ? message(ev.id) : undefined;
  const ours = m && m.chat === from;
  switch (ev.t) {
    case 'm':
      if (!m)
        db.run(
          'insert into messages (id, chat, mine, kind, body, reply, status, ttl, ts, meta, once) values (?, ?, 0, ?, ?, ?, 2, ?, ?, ?, ?)',
          ev.id,
          from,
          KINDS.includes(ev.kind ?? 'text') ? (ev.kind ?? 'text') : 'text',
          ev.body,
          ev.reply ?? null,
          ev.ttl,
          ev.ts,
          ev.meta ? JSON.stringify({ ...ev.meta, local: undefined }) : null,
          ev.once === 2 ? 2 : ev.once ? 1 : 0,
        );
      changed(from);
      return ev.id;
    case 'e':
      if (ours && !m.mine && !m.gone) db.run('update messages set body = ?, edited = ? where id = ?', ev.body, ev.ts, ev.id);
      break;
    case 'd':
      if (ours && !m.mine) db.run("update messages set gone = 1, body = '', reacts = '{}', meta = null, pin = 0 where id = ?", ev.id);
      break;
    case 'r':
      if (ours && !m.gone) {
        const r = JSON.parse(m.reacts);
        if (ev.e) r[from] = ev.e;
        else delete r[from];
        db.run('update messages set reacts = ? where id = ?', JSON.stringify(r), ev.id);
      }
      break;
    case 'c':
      if (ours && !m.gone) db.run('update messages set body = ? where id = ?', toggleTask(m.body, ev.line, ev.done), ev.id);
      break;
    case 'o':
      if (ours && m.mine) patchMeta(ev.id, { opened: true, local: undefined, thumb: undefined });
      break;
    case 'p':
      if (ours && !m.gone) db.run('update messages set pin = ? where id = ?', ev.on ? 1 : 0, ev.id);
      break;
    case 'lp':
      if (ours && !m.mine && !m.gone) patchMeta(ev.id, { link: ev.link });
      break;
    case 's':
      for (const id of ev.ids) {
        const mm = message(id);
        if (!mm?.mine || mm.chat !== from || mm.status >= ev.s) continue;
        if (ev.s === 3 && mm.ttl === -1) db.run('delete from messages where id = ?', id);
        else db.run('update messages set status = ?, exp = ? where id = ?', ev.s, ev.s === 3 && mm.ttl > 0 ? clock() + mm.ttl * 1000 : mm.exp, id);
      }
      break;
    case 'ttl':
      db.run('update contacts set ttl = ? where id = ?', ev.ttl, from);
      sys(from, ev.ttl ? `${c.label} set disappearing messages to ${ttlLabel(ev.ttl)}` : `${c.label} turned off disappearing messages`);
      break;
    case 'push':
      db.run('update contacts set push = ? where id = ?', ev.push, from);
      break;
    case 'st':
      if (ev.exp > clock() && ev.exp - ev.ts <= DAY && (ev.kind === 'image' || ev.kind === 'text'))
        db.run(
          'insert or ignore into stories (id, author, kind, body, meta, ts, exp) values (?, ?, ?, ?, ?, ?, ?)',
          ev.id,
          from,
          ev.kind,
          ev.body,
          JSON.stringify({ ...ev.meta, local: undefined }),
          ev.ts,
          ev.exp,
        );
      changed(STORIES);
      break;
    case 'sv':
      if (db.get('select 1 from stories where id = ? and author = ?', ev.id, me.id))
        db.run('insert or ignore into views (story, viewer, ts) values (?, ?, ?)', ev.id, from, clock());
      changed(STORIES);
      break;
    case 'sd':
      db.run('delete from stories where id = ? and author = ?', ev.id, from);
      changed(STORIES);
      break;
  }
  changed(from);
}
