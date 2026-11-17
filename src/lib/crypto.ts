// Pure crypto (no RN imports, so tests run under tsx). X25519 per contact, XChaCha20-Poly1305 boxes.
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

let random: (n: number) => Uint8Array = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
export const setRandom = (f: (n: number) => Uint8Array) => void (random = f);
export const randomBytes = (n: number) => random(n);

export function b64(u: Uint8Array) {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(s: string) {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

export const publicKey = (secret: Uint8Array) => x25519.getPublicKey(secret);

export function keygen() {
  const secret = random(32);
  return { secret, pub: x25519.getPublicKey(secret) };
}

// Same key on both sides: X25519 then HKDF so the raw curve point is never used directly.
export const sharedKey = (secret: Uint8Array, theirPub: Uint8Array) =>
  hkdf(sha256, x25519.getSharedSecret(secret, theirPub), undefined, utf8ToBytes('ping/v1'), 32);

export const seal = (key: Uint8Array, value: unknown) => b64(sealBytes(key, utf8ToBytes(JSON.stringify(value))));
export function open<T>(key: Uint8Array, box: string): T {
  return JSON.parse(bytesToUtf8(openBytes(key, unb64(box))));
}

export function sealBytes(key: Uint8Array, data: Uint8Array) {
  const nonce = random(24);
  const ct = xchacha20poly1305(key, nonce).encrypt(data);
  const out = new Uint8Array(24 + ct.length);
  out.set(nonce);
  out.set(ct, 24);
  return out;
}
export const openBytes = (key: Uint8Array, u: Uint8Array) => xchacha20poly1305(key, u.subarray(0, 24)).decrypt(u.subarray(24));

// 32 symbols (no 0/O/1/I), so byte & 31 is unbiased.
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newCode = () => Array.from(random(8), (b) => ALPHA[b & 31]).join('');
export const isCode = (s: string) => /^[A-HJ-NP-Z2-9]{8}$/.test(s);

// Same 60 digits on both phones; compare to rule out a swapped key.
export function safetyNumber(a: Uint8Array, b: Uint8Array) {
  const [x, y] = b64(a) < b64(b) ? [a, b] : [b, a];
  const joined = new Uint8Array(64);
  joined.set(x);
  joined.set(y, 32);
  const h = sha256(joined);
  return Array.from({ length: 12 }, (_, i) => String(((h[i * 2] << 8) | h[i * 2 + 1]) % 100000).padStart(5, '0')).join(' ');
}

// Password-locked blob for backups. PBKDF2-SHA256 shares its primitives with the message crypto, so it matches on every runtime.
const ROUNDS = 40_000;
const stretch = (password: string, salt: Uint8Array, c: number) => pbkdf2Async(sha256, utf8ToBytes(password), salt, { c, dkLen: 32 });
export async function lock(password: string, value: unknown) {
  const salt = random(16);
  return JSON.stringify({ ping: 2, c: ROUNDS, salt: b64(salt), box: seal(await stretch(password, salt, ROUNDS), value) });
}
export async function unlock<T>(password: string, text: string): Promise<T> {
  const f = JSON.parse(text);
  if (f?.ping !== 2) throw new Error('not a backup');
  try {
    return open<T>(await stretch(password, unb64(f.salt), f.c ?? 120_000), f.box);
  } catch {
    throw new Error('wrong password');
  }
}
