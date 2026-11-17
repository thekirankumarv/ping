import { Directory, File, Paths, UploadType } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { AppState } from 'react-native';
import * as core from './core';
import { b64, openBytes, randomBytes, sealBytes, unb64 } from './crypto';
import { fetchPreview, firstUrl } from './links';
import { afterReceive, removeRemote, storageAuth } from './relay';

export const MAX_FILE = 20 * 1024 * 1024;
const dir = new Directory(Paths.document, 'media');
const hex = (n: number) => Array.from(randomBytes(n), (b) => b.toString(16).padStart(2, '0')).join('');
const safe = (name: string) => name.replace(/[^\w.\- ]+/g, '_').slice(-80) || 'file';

// One folder per attachment so a shared or opened file keeps its real name.
function store(id: string, from: string, name: string) {
  const home = new Directory(dir, id);
  home.create({ intermediates: true, idempotent: true });
  const f = new File(home, safe(name));
  new File(from).moveSync(f);
  return f.uri;
}

type Opts = { reply?: string | null; ttl?: number; quiet?: boolean; once?: boolean; body?: string };

async function compress(uri: string) {
  const src = await ImageManipulator.manipulate(uri).renderAsync();
  const long = Math.max(src.width, src.height);
  const scale = long > 1600 ? 1600 / long : 1;
  const w = Math.round(src.width * scale);
  const h = Math.round(src.height * scale);
  const full = await ImageManipulator.manipulate(uri).resize({ width: w, height: h }).renderAsync();
  const out = await full.saveAsync({ compress: 0.78, format: SaveFormat.JPEG });
  const tiny = await (
    await ImageManipulator.manipulate(uri).resize({ width: 24 }).renderAsync()
  ).saveAsync({ compress: 0.5, format: SaveFormat.JPEG, base64: true });
  return { uri: out.uri, meta: { w, h, size: new File(out.uri).size, mime: 'image/jpeg', thumb: tiny.base64 } };
}

export async function sendImage(chat: string, uri: string, o: Opts = {}) {
  const img = await compress(uri);
  const id = core.addMedia(chat, 'image', img.meta, o);
  if (!id) return;
  core.setLocal(id, store(id, img.uri, 'photo.jpg'));
  upload(id, o.quiet);
}

// One ciphertext, one upload per contact (each can only read their own folder).
export async function postPhotoStory(uri: string, caption: string) {
  const img = await compress(uri);
  const id = core.addStory('image', caption, img.meta);
  const local = store(id, img.uri, 'story.jpg');
  core.setStoryLocal(id, local);
  const tmp = new File(Paths.cache, hex(8));
  try {
    const key = randomBytes(32);
    tmp.writeSync(sealBytes(key, await new File(local).bytes()));
    for (const peer of core.connected()) {
      const path = await put(tmp, peer).catch(() => null);
      if (path) core.shipStory(id, peer, { path, key: b64(key) });
    }
  } finally {
    if (tmp.exists) tmp.delete();
  }
}

export function sendFile(chat: string, f: { uri: string; name: string; size?: number; mimeType?: string }, o: Opts = {}) {
  const size = f.size ?? new File(f.uri).size;
  if (size > MAX_FILE) return 'too-big' as const;
  const id = core.addMedia(chat, 'file', { name: f.name, size, mime: f.mimeType || 'application/octet-stream' }, o);
  if (!id) return;
  core.setLocal(id, store(id, f.uri, f.name));
  upload(id, o.quiet);
}

export function sendVoice(chat: string, uri: string, dur: number, wave: number[], o: Opts = {}) {
  const id = core.addMedia(chat, 'voice', { dur, wave, size: new File(uri).size, mime: 'audio/mp4' }, o);
  if (!id) return;
  core.setLocal(id, store(id, uri, 'voice.m4a'));
  upload(id, o.quiet);
}

export async function attachPreview(id: string, body: string) {
  const url = firstUrl(body);
  const p = url && (await fetchPreview(url));
  if (!p) return;
  const { image, ...link } = p;
  if (image) {
    const tmp = new File(Paths.cache, hex(8));
    try {
      await File.downloadFileAsync(image, tmp);
      const ref = await ImageManipulator.manipulate(tmp.uri).resize({ width: 240 }).renderAsync();
      link.thumb = (await ref.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true })).base64;
    } catch {
    } finally {
      if (tmp.exists) tmp.delete();
    }
  }
  if (link.title || link.thumb) core.setLink(id, link);
}

const busy = new Set<string>();

async function put(f: File, peer: string) {
  const path = `${peer}/${hex(16)}`;
  const { url, headers } = await storageAuth();
  const r = await f.upload(`${url}/media/${path}`, {
    httpMethod: 'POST',
    uploadType: UploadType.BINARY_CONTENT,
    headers: { ...headers, 'content-type': 'application/octet-stream' },
  });
  if (r.status >= 300) throw new Error(r.body);
  return path;
}

async function upload(id: string, quiet?: boolean, attempt = 1) {
  const m = core.message(id);
  const local = m && core.metaOf(m).local;
  if (!m || !local || busy.has(id)) return;
  if (core.isSelf(m.chat)) return;
  busy.add(id);
  const tmp = new File(Paths.cache, hex(8));
  try {
    const key = randomBytes(32);
    tmp.writeSync(sealBytes(key, await new File(local).bytes()));
    const path = await put(tmp, m.chat);
    core.shipMedia(id, { path, key: b64(key) }, quiet);
  } catch {
    if (attempt < 3) setTimeout(() => upload(id, quiet, attempt + 1), attempt * 2000);
    else core.mediaFailed(id);
  } finally {
    busy.delete(id);
    if (tmp.exists) tmp.delete();
  }
}
export const retry = (id: string) => upload(id);

// Fetches, decrypts and stores one attachment; returns the local uri, or null to retry later.
async function pull(id: string, meta: core.Meta, name: string) {
  if (!meta.path || !meta.key || busy.has(id)) return null;
  busy.add(id);
  const tmp = new File(Paths.cache, hex(8));
  try {
    const { url, headers } = await storageAuth();
    await File.downloadFileAsync(`${url}/authenticated/media/${meta.path}`, tmp, { headers });
    const out = new File(Paths.cache, hex(8));
    out.writeSync(openBytes(unb64(meta.key), await tmp.bytes()));
    removeRemote(meta.path).catch(() => {});
    return store(id, out.uri, name);
  } catch {
    return null;
  } finally {
    busy.delete(id);
    if (tmp.exists) tmp.delete();
  }
}

export async function fetchAll() {
  for (const m of core.toFetch()) {
    const meta = core.metaOf(m);
    const local = await pull(m.id, meta, m.kind === 'image' ? 'photo.jpg' : m.kind === 'voice' ? 'voice.m4a' : (meta.name ?? 'file'));
    if (local && !core.message(m.id)?.gone) core.setLocal(m.id, local);
  }
  for (const st of core.storiesToFetch()) {
    const local = await pull(st.id, core.storyMeta(st), 'story.jpg');
    if (local) core.setStoryLocal(st.id, local);
  }
}

// Files no message points at any more (deleted, expired, viewed once).
export function gc() {
  if (!dir.exists) return;
  const norm = (u: string) =>
    decodeURI(u)
      .replace(/^file:\/+/, '/')
      .replace(/\/+$/, '');
  const keep = new Set([...core.localFiles()].map(norm));
  for (const e of dir.list()) {
    const files = e instanceof Directory ? e.list() : [e];
    const used = files.some((f) => keep.has(norm(f.uri)));
    if (!used) e.delete();
  }
}

export function wipeMedia() {
  if (dir.exists) dir.delete();
}

export function startMedia() {
  afterReceive(() => void fetchAll());
  AppState.addEventListener('change', (st) => {
    if (st !== 'active') return;
    fetchAll();
    for (const m of core.unshipped()) upload(m.id);
  });
  fetchAll();
  for (const m of core.unshipped()) upload(m.id);
  gc();
  setInterval(gc, 30_000);
}
