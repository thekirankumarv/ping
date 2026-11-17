import { openDatabaseSync } from 'expo-sqlite';
import { useEffect, useMemo, useReducer } from 'react';
import * as core from './core';

const d = openDatabaseSync('ping.db');
d.execSync('pragma journal_mode = wal');

export const sql: core.Sql = {
  exec: (s) => d.execSync(s),
  run: (s, ...a) => void d.runSync(s, a),
  all: (s, ...a) => d.getAllSync(s, a),
  get: (s, ...a) => d.getFirstSync(s, a) ?? undefined,
};

// Synchronous query, re-run when `key` changes or that chat (or any chat) changes.
export function useLive<T>(query: () => T, key: string, chat?: string): T {
  const [tick, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => core.onChange((c) => (!chat || c === chat) && bump()), [chat]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => query(), [tick, key]);
}

export function wipeLocal() {
  d.execSync('delete from messages; delete from contacts; delete from outbox;');
}
