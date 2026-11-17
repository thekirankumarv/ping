import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const web = Platform.OS === 'web';

export function readPrefs(name: string): Record<string, unknown> {
  try {
    const raw = web ? globalThis.localStorage?.getItem(name) : new File(Paths.document, name).textSync();
    const p = JSON.parse(raw ?? '{}');
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

export function writePrefs(name: string, value: object) {
  try {
    const json = JSON.stringify(value);
    if (web) return globalThis.localStorage?.setItem(name, json);
    const f = new File(Paths.document, name);
    f.create({ overwrite: true });
    f.writeSync(json);
  } catch {}
}
