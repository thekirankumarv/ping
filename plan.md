# PING — Plan

## 1. Goal

A private, daily-use chat app for 2–3 people that replaces WhatsApp. No phone number, no name, no email. People connect only by code, link, or QR. Chats live on the phone, messages can disappear, and the app costs nothing to run.

**Hard constraints**

- Android only, distributed as an APK (no Play Store fee).
- Zero running cost: free tiers only, no card on file anywhere.
- Chat history stored on the device, not on a server.
- Instant UI: every action renders from local data first, network second.

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| App | Expo (dev build) + TypeScript + expo-router | Same toolchain as existing projects; APK builds locally |
| Local data | expo-sqlite (messages, search), JSON files in app storage (settings) | Fast, synchronous reads for instant UI |
| Relay | Supabase free tier: Realtime, Postgres, Storage, anonymous auth | Offline delivery, presence, typing; no card |
| Encryption | @noble/curves X25519 + HKDF, @noble/ciphers XChaCha20-Poly1305 | Audited, pure JS, already used in Vaultly |
| Push | Expo push service + FCM | Free; sender device calls it directly, no server function |
| Calls | react-native-webrtc, Google STUN, react-native-incall-manager | Peer-to-peer audio/video |
| Lists | FlashList | Smooth scrolling on long chats |
| Animation | Reanimated 4, Gesture Handler 3, react-native-keyboard-controller; Skia later for effects | Runs on the UI thread; composer follows the keyboard |
| Media | expo-image, expo-image-manipulator, expo-audio, expo-document-picker | Compression, caching, voice notes |
| Other | expo-camera (QR scan), react-native-qrcode-svg, expo-screen-capture, expo-local-authentication, expo-secure-store, react-native-webview | |

## 3. Architecture

### Identity

- First launch: the app signs in anonymously to Supabase (gives a stable user ID) and generates an encryption keypair. The private key stays in secure storage and never leaves the phone.
- No profile data. Avatar is a gradient generated from the public key. Contact names are labels you set locally for each person; the other side never sees them.
- Uninstall or lost phone means the identity is gone. Encrypted backup file (section 5) is the only recovery.

### Pairing

- Each user has a pairing code (8 characters), also shown as a link (`chatapp://add/<code>`) and a QR.
- The code can be regenerated at any time; old codes stop working.
- Adding someone sends a request; they must accept before any message is delivered.
- On accept, both sides exchange public keys and push tokens inside the encrypted channel.
- Safety number screen: both people can compare a short fingerprint to confirm no one is in the middle.

### Message flow

1. Sender writes the message to local SQLite and shows it immediately (status: sending).
2. Message is encrypted for the recipient and inserted into the relay `queue` table.
3. Recipient online: Realtime delivers it within milliseconds. Recipient offline: sender calls Expo push; the row waits in the queue.
4. Recipient stores it locally, deletes the relay row, and sends a delivered receipt. Read receipt follows when the chat is opened.
5. Edits, deletes, reactions, receipts, and checklist ticks travel as small encrypted events through the same queue.

Typing and online status use Realtime broadcast and presence; nothing is stored.

### Relay schema (Supabase)

- `profiles(id, pairing_code, public_key)` — lookup for pairing only.
- `queue(id, sender_id, recipient_id, ciphertext, created_at)` — undelivered events. Row-level security: only the recipient can read or delete their rows; only authenticated users can insert. A scheduled cleanup drops rows older than 30 days.
- Storage bucket `media` — encrypted files, deleted by the recipient after download, with the same 30-day cleanup.

The relay only ever sees ciphertext and who is talking to whom.

### Local schema (SQLite)

- `contacts(id, label, public_key, push_token, theme, disappear_default, blocked)`
- `messages(id, chat_id, sender_id, type, body, reply_to, status, edited_at, expires_at, view_once, created_at)`
- `media(message_id, local_path, mime, size, width, height, duration)`
- `reactions(message_id, sender_id, emoji)`
- `messages_fts` — full-text search index.

## 4. Requested features

| Feature | Detail |
|---|---|
| Text, emoji | Emoji keyboard plus a quick-reaction row |
| Images, documents | Images compressed before send; files capped at 20 MB |
| Voice notes | Hold to record, waveform, 1x/1.5x/2x playback |
| Disappearing messages | Off, after seen, 24 hours, 48 hours, 1 week, 1 month. Set per chat as a default and overridable per message. Timer starts when read. Removed from both phones. |
| View-once image | Opens once, then deleted; screenshots blocked while open |
| Reply | Swipe a message to reply; tap the quote to jump to the original |
| Edit | "edited" tag on the bubble |
| Delete | For me, or for everyone |
| Typing indicator | Animated dots |
| Online / last seen | Presence-based; can be hidden in settings |
| Timestamps | 12-hour format, date separators (Today, Yesterday, 17 Nov 2026) |
| Delivery status | Sending, sent, delivered, read |
| YouTube and Shorts | Plays inside the chat in an embedded player |
| Instagram Reels | In-app embed where the reel is public; falls back to opening Instagram |
| Long messages | Collapsed with "Read more"; full-screen reader |
| Rich composer | Markdown: bold, italic, strikethrough, headings, quotes, lists, checkboxes, inline code, code blocks with syntax highlighting and a copy button. Formatting toolbar and live preview. |
| Connect by code, link, QR | Section 3, Pairing |
| Voice and video calls | Phase 3 |

## 5. Extra features

**Privacy**

- App lock with fingerprint or PIN; auto-lock timer.
- Decoy PIN that opens an empty app.
- Panic wipe: one action erases all chats and the identity.
- Screenshot blocking, switchable per chat.
- Hidden notification content ("New message" only).
- Countdown ring on disappearing messages showing time left.
- Block and remove contact.

**Better than WhatsApp**

- Shared checklists: a checklist message both people can tick, synced live.
- Scheduled send and silent send (no notification).
- "Remind me" on any message: local notification at a chosen time.
- Notes to self: a private chat for your own notes, links, and files.
- Reactions with any emoji.
- Pinned and starred messages.
- Full-text search across all chats, fully offline.
- Link previews generated on the sender's phone, so the recipient's phone never contacts the site.
- Drafts saved per chat.
- Media gallery per chat (images, files, links).
- Encrypted backup: export all chats to one password-protected file; import on a new phone.
- Storage screen: space used per chat, one-tap clear.

**Later, if wanted**

- Small groups (up to about 8 people).
- Live location share.
- Screen share in calls.

## 6. Design

**Direction:** quiet, dark-first, content-forward. Flat surfaces, generous spacing, one accent color, type doing most of the work. No clutter, no badges that are not needed.

**Themes**

- Modes: Dark, AMOLED black, Light, Follow system.
- Accent: 12 presets, custom color picker, or Material You (from the phone wallpaper).
- Per-chat theme: accent and wallpaper (solid, gradient, or own photo with blur and dim controls).
- Bubble style: rounded, squared, or minimal (no bubble); adjustable corner radius.
- Font size slider; compact or comfortable density.
- Live preview of a sample chat while changing any setting.

**Motion**

Smooth and precise, no bounce. Everything runs on the UI thread at up to 120 Hz.

- Send: the text moves from the composer into its bubble in one continuous motion.
- Incoming: bubble fades and slides up 8 px.
- Disappearing: message dissolves into particles (Skia shader).
- Long-press: background blurs, the message lifts, reactions and actions appear around it.
- Swipe to reply with a haptic tick at the threshold.
- Image to full screen: shared-element transition; drag down to dismiss.
- Typing dots, voice waveform, and recording pulse.
- Theme switch: circular reveal from the tap point.
- Keyboard and composer move together with no jump.
- Haptics on send, reaction, and long-press.

**Screens**

1. Onboarding (three cards, then straight in; no sign-up form)
2. Chat list
3. Chat
4. Add contact (my code and QR / scan / enter code)
5. Contact details (label, theme, disappearing default, media, safety number, block)
6. Media viewer
7. Long-message reader and rich composer
8. Search
9. Settings (appearance, privacy, notifications, storage, backup)
10. Call (phase 3)

## 7. Performance targets

- Cold start to chat list: under 1 second.
- Message appears after tapping send: under 50 ms (local write first).
- Delivery when both are online: under 300 ms.
- Scrolling: no dropped frames with 10,000 messages in a chat.
- Images: blurred thumbnail shown immediately, full image loads in behind it.

## 8. Phases

**Phase 1 — Core chat**

- Project setup, design system, themes.
- Identity, pairing (code, link, QR), contact requests.
- Encrypted text messaging through the relay, with delivery and read status.
- Reply, edit, delete, reactions.
- Disappearing messages.
- Typing, online, last seen.
- Markdown composer, long messages, code blocks, shared checklists.
- Push notifications.
- App lock.

**Phase 2 — Media and extras**

- Images, documents, voice notes, view-once.
- YouTube and Reels embeds, link previews.
- Search, pins, stars, media gallery, drafts.
- Scheduled and silent send, reminders, notes to self.
- Per-chat themes and wallpapers, dissolve effect, remaining motion polish.
- Encrypted backup, storage screen, decoy PIN, panic wipe.

**Phase 3 — Calls**

- Voice and video calls over WebRTC.
- Incoming call notification with full-screen ring.
- Mute, speaker, camera flip, picture-in-picture.

Each phase ends with an APK that is usable on its own.

## 9. Limits

- Cannot stop someone photographing the screen with another device.
- No recovery without a backup file: lost phone means lost chats and identity.
- Calls fail on some networks without a relay server; free relay tiers are limited.
- Ringing while the app is fully killed is unreliable on some phone brands with aggressive battery saving.
- Instagram embeds break when Instagram changes its login wall.
- Files over 20 MB are not supported on the free tier.
- Notification delivery depends on the phone's battery settings; the app will prompt to disable battery optimization.

## 10. Free-tier budget

| Resource | Free limit (approx.) | Expected use for 3 people |
|---|---|---|
| Database | 500 MB | Under 5 MB (queue empties on delivery) |
| File storage | 1 GB | Under 100 MB (files deleted after download) |
| Transfer | 5 GB / month | Under 1 GB with image compression |
| Realtime messages | 2 million / month | Under 100,000 |
| Expo push | Free | A few hundred per day |

Supabase pauses a project after 7 days with no activity; daily use prevents this. Limits should be confirmed on the Supabase pricing page at setup.

## 11. Setup (done)

- Supabase org renamed to **Crafting**. Project **ping** (ref `watzdqfgjfrgljwlybbp`, Seoul) is separate from VoicePlace, which keeps its own project.
- Anonymous sign-ins enabled. Schema in `supabase/schema.sql` (profiles, queue, `find_code`, `peers`, daily cleanup).
- Disappearing messages: "Off" stays as an option and is the default; each chat or message can be set up to 1 month.

## 12. Status (2026-11-17)

Built and tested on the emulator against a live test peer:

- Phase 1: everything listed.
- Phase 2: photos (compressed, blurred thumb first), documents up to 20 MB, voice notes (hold or tap-to-lock, waveform, 1×/1.5×/2×), view-once photos (screenshots blocked, closes after 10 s), YouTube and Shorts in an in-app player, Instagram embeds, sender-side link previews, pins, starred, media gallery, drafts, scheduled send, silent send, local reminders, notes to self, per-chat colour and wallpaper, per-chat screenshot block, storage screen, encrypted backup and restore.
- Stories: photo or text, 24 hours, sent to every contact, "seen by" list, ring on avatars in the chat list, chat header and profile.
- Phase 3: voice and video calls over WebRTC with encrypted signalling, mute, speaker, camera on/off, flip, call log.

Not built:

- Decoy PIN (the app lock uses the phone's own fingerprint or PIN).
- Picture-in-picture during calls; call audio over a TURN relay (STUN only, so some strict networks will not connect).
- Particle dissolve effect (messages fade out instead).
- Backups do not include photos or files.

## 13. Open items

1. Firebase project for FCM plus an EAS project id, so messages and calls ring while PING is closed. Until then they arrive when PING is open.
