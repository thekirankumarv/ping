# PING

Private chat for a few people. No phone number, no name, no email: connect by code, link or QR. Chats live on the phone, everything that crosses the network is end-to-end encrypted, and the whole thing runs on free tiers.

Android only. Build the APK yourself with the steps below.

## Features

**Chat**
- Pair by 8-character code, QR or link; codes can be regenerated
- Text with markdown, replies, reactions, edit, delete for everyone, share
- Typing indicator, online status, read receipts
- Disappearing messages per chat
- Pinned messages, scheduled send, silent send, reminders on any message
- Notes to self
- Search across all chats
- Per-chat colour, wallpaper and screenshot blocking
- Clear chat, delete chat, block

**Media**
- Photos (compressed, blurred preview while loading), documents up to 20 MB, voice notes with waveform and 1× / 1.5× / 2× playback
- View-once photos with screenshots blocked and a 10 second timer
- Link previews; YouTube, Shorts and Instagram reels play inside the app
- Shared media, files and links gallery per contact
- Storage overview and cleanup

**Stories**
- Text or photo stories that last 24 hours
- Ring on the avatar in chat list, chat header and profile
- Seen-by list, reply to a story, delete your story

**Calls**
- Voice and video calls over WebRTC, peer to peer
- Mute, speaker, camera on/off, flip camera, call log in the chat

**Privacy**
- App lock with biometrics
- Encrypted backup file (password protected) to move to a new phone

## How it works

- **Identity:** anonymous Supabase sign-in plus an X25519 keypair generated on the phone. The private key stays in secure storage.
- **Messages:** sealed with XChaCha20-Poly1305 using a key derived from both parties' keys (X25519 + HKDF). Supabase only holds encrypted rows in a queue until the other phone picks them up, then deletes them.
- **Media:** each file is encrypted with its own random key, uploaded to a private storage bucket, and the key travels inside the encrypted message. The receiver downloads, decrypts and deletes the remote copy.
- **Calls:** WebRTC with Google STUN. Signalling goes over an encrypted Supabase Realtime channel.
- **Notifications:** content-free "New message" / "Incoming call" pushes through Expo and Firebase Cloud Messaging. Push tokens are exchanged inside the encrypted channel.
- **Storage:** chats, contacts and stories live in SQLite on the phone.
- **Backup:** PBKDF2-SHA256 + XChaCha20-Poly1305. Contains identity, contacts and messages; photos and files are not included.

## Stack

Expo SDK 58, React Native, TypeScript, expo-router, expo-sqlite, Reanimated, Gesture Handler, react-native-keyboard-controller, react-native-webrtc, Supabase (auth, realtime, postgres, storage), @noble/curves and @noble/ciphers.

## Project layout

```
src/app/          screens (expo-router)
src/components/   UI pieces: bubbles, composer, media, avatar
src/lib/          core chat engine, crypto, relay, media, calls, backup
supabase/         schema, policies and storage bucket
plugins/          Expo config plugin for release signing
plan.md           full feature plan, status and open items
```

## Setup

1. Create a Supabase project, enable anonymous sign-ins and run `supabase/schema.sql` in the SQL editor.
2. Put your project URL and publishable key in `src/lib/relay.ts`.
3. For notifications while the app is closed: create a Firebase project, add an Android app with your package name, put its `google-services.json` in the project root, run `npx eas init`, and upload a Firebase service account key with `npx eas credentials -p android` (Google Service Account → FCM V1).
4. Install and run on a device or emulator:

```bash
npm install
npx expo run:android
```

## Release build

Add a signing key to `~/.gradle/gradle.properties`:

```
PING_STORE_FILE=/path/to/release.keystore
PING_STORE_PASSWORD=...
PING_KEY_ALIAS=...
PING_KEY_PASSWORD=...
```

Then:

```bash
npm run apk
```

The signed APK is written to `PING.apk`.

## Checks

```bash
npm test
npm run typecheck
npm run lint
```

## Limits

- On a closed phone an incoming call shows as a notification; tapping it opens PING and the call rings.
- No TURN server, so calls may fail on strict corporate or carrier networks.
- Restoring a backup moves the account; the old phone should uninstall PING.

## License

MIT
