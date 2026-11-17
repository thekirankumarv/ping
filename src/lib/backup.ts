import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useMe } from './boot';
import * as core from './core';
import { b64, lock, unlock } from './crypto';
import { sql } from './db';
import { loadKeys, saveSecret } from './identity';
import { restoreIdent, savedIdent, session } from './relay';

type Backup = {
  v: 1;
  uid: string;
  code: string;
  secret: string;
  auth: Record<string, unknown>;
  contacts: Record<string, unknown>[];
  messages: Record<string, unknown>[];
};

// Chats, contacts and identity; photos and files stay out to keep the file small.
export async function makeBackup(password: string) {
  const { uid, code } = savedIdent();
  const { secret } = await loadKeys();
  const messages = sql.all<core.Msg>("select * from messages where kind != 'call'").map((m) => {
    const { local: _, ...meta } = core.metaOf(m);
    return { ...m, meta: m.meta ? JSON.stringify(meta) : null };
  });
  const data: Backup = { v: 1, uid: uid!, code: code!, secret: b64(secret), auth: session(), contacts: sql.all('select * from contacts'), messages };
  return { name: `PING-backup-${new Date().toISOString().slice(0, 10)}.ping`, text: await lock(password, data) };
}

function insert(table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row).filter((k) => /^[a-z]+$/.test(k));
  sql.run(
    `insert or replace into ${table} (${cols.join(', ')}) values (${cols.map(() => '?').join(', ')})`,
    ...cols.map((k) => row[k] as string | number | null),
  );
}

export async function restoreBackup(f: File, password: string) {
  const data = await unlock<Backup>(password, await f.text());
  await saveSecret(data.secret);
  const keys = await loadKeys();
  core.init(sql, { id: data.uid, secret: keys.secret });
  for (const c of data.contacts) insert('contacts', c);
  for (const m of data.messages) insert('messages', m);
  await restoreIdent({ uid: data.uid, code: data.code }, data.auth);
  useMe.setState({ pub: keys.pub });
}

export async function saveBackup(b: { name: string; text: string }) {
  const dir = await Directory.pickDirectoryAsync();
  dir.createFile(b.name, 'application/octet-stream').writeSync(b.text);
}

export async function shareBackup(b: { name: string; text: string }) {
  const f = new File(Paths.cache, b.name);
  f.create({ overwrite: true });
  f.writeSync(b.text);
  await Sharing.shareAsync(f.uri, { mimeType: 'application/octet-stream', dialogTitle: 'Save PING backup' });
}
