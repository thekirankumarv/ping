import { create } from 'zustand';
import { readPrefs, writePrefs } from './prefs';

type Privacy = { hideOnline: boolean; noScreenshots: boolean };
const FILE = 'ping.privacy.json';
const saved = readPrefs(FILE) as Partial<Privacy>;

export const usePrivacy = create<Privacy>()(() => ({
  hideOnline: saved.hideOnline ?? false,
  noScreenshots: saved.noScreenshots ?? false,
}));

export function setPrivacy(p: Partial<Privacy>) {
  usePrivacy.setState(p);
  writePrefs(FILE, usePrivacy.getState());
}
