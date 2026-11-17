import * as ExpoCrypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { b64, keygen, publicKey, unb64 } from './crypto';

// Hermes has no Web Crypto; noble and supabase-js both reach for it.
Object.assign((globalThis.crypto ??= {} as Crypto), { getRandomValues: ExpoCrypto.getRandomValues, randomUUID: ExpoCrypto.randomUUID });

const SECRET = 'ping.secret';

// The private key never leaves this phone.
export async function loadKeys() {
  let s = await SecureStore.getItemAsync(SECRET);
  if (!s) {
    s = b64(keygen().secret);
    await SecureStore.setItemAsync(SECRET, s);
  }
  const secret = unb64(s);
  return { secret, pub: b64(publicKey(secret)) };
}

export const forgetKeys = () => SecureStore.deleteItemAsync(SECRET);
export const saveSecret = (secret: string) => SecureStore.setItemAsync(SECRET, secret);
