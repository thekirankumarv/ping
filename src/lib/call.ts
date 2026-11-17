import { requestRecordingPermissionsAsync } from 'expo-audio';
import { Camera } from 'expo-camera';
import { router } from 'expo-router';
import { Vibration } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import { mediaDevices, MediaStream, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc';
import { create } from 'zustand';
import * as core from './core';
import { randomBytes } from './crypto';
import { sendPush } from './push';
import { handleSignals, signal, useNet } from './relay';
import { duration } from './time';

type Sig =
  | { t: 'offer'; cid: string; sdp: string; video: boolean }
  | { t: 'ring'; cid: string }
  | { t: 'answer'; cid: string; sdp: string }
  | { t: 'ice'; cid: string; c: { candidate: string; sdpMLineIndex?: number | null; sdpMid?: string | null } }
  | { t: 'end'; cid: string; why: 'hangup' | 'decline' | 'busy' };

export type Phase = 'idle' | 'calling' | 'ringing' | 'incoming' | 'connecting' | 'live' | 'ended';
type Call = {
  phase: Phase;
  cid: string;
  peer: string;
  video: boolean;
  outgoing: boolean;
  started: number;
  muted: boolean;
  speaker: boolean;
  camOff: boolean;
  local: MediaStream | null;
  remote: MediaStream | null;
  note: string;
};
const IDLE: Call = {
  phase: 'idle',
  cid: '',
  peer: '',
  video: false,
  outgoing: false,
  started: 0,
  muted: false,
  speaker: false,
  camOff: false,
  local: null,
  remote: null,
  note: '',
};
export const useCall = create<Call>()(() => IDLE);
const set = (p: Partial<Call>) => useCall.setState(p);
const get = () => useCall.getState();

const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const RING_MS = 45_000;
let pc: RTCPeerConnection | null = null;
let offer: string | null = null;
let pending: Sig[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

function send(s: Sig) {
  signal(get().peer, core.sealFor(get().peer, s));
}

async function media(video: boolean) {
  const mic = await requestRecordingPermissionsAsync();
  if (!mic.granted) throw new Error('mic');
  if (video && !(await Camera.requestCameraPermissionsAsync()).granted) throw new Error('camera');
  return (await mediaDevices.getUserMedia({
    audio: true,
    video: video ? { facingMode: 'user', width: 720, height: 1280, frameRate: 30 } : false,
  })) as MediaStream;
}

function connect(stream: MediaStream) {
  const p = new RTCPeerConnection({ iceServers: ICE });
  stream.getTracks().forEach((t) => p.addTrack(t, stream));
  p.addEventListener('icecandidate', (e) => {
    if (e.candidate) send({ t: 'ice', cid: get().cid, c: e.candidate.toJSON() });
  });
  p.addEventListener('track', (e) => {
    const s = e.streams?.[0];
    if (s) set({ remote: s });
  });
  p.addEventListener('connectionstatechange', () => {
    if (p.connectionState === 'connected' && get().phase !== 'live') {
      clearTimeout(timer);
      set({ phase: 'live', started: Date.now() });
    }
    if (p.connectionState === 'failed') finish('Connection lost', true);
  });
  pc = p;
  return p;
}

async function flushIce() {
  const queued = pending.filter((s) => s.t === 'ice');
  pending = [];
  for (const s of queued) if (s.t === 'ice') await pc?.addIceCandidate(new RTCIceCandidate(s.c)).catch(() => {});
}

export async function startCall(peer: string, video: boolean) {
  if (get().phase !== 'idle') return;
  const cid = Array.from(randomBytes(8), (b) => b.toString(16).padStart(2, '0')).join('');
  set({ ...IDLE, phase: 'calling', cid, peer, video, outgoing: true, speaker: video });
  try {
    const local = await media(video);
    set({ local });
    const p = connect(local);
    const o = await p.createOffer({});
    await p.setLocalDescription(o);
    InCallManager.start({ media: video ? 'video' : 'audio', ringback: '_DTMF_' });
    InCallManager.setForceSpeakerphoneOn(video);
    if (!signal(peer, core.sealFor(peer, { t: 'offer', cid, sdp: o.sdp, video } satisfies Sig))) return finish('Not reachable', true);
    if (!useNet.getState().online[peer]) sendPush(core.contact(peer)?.push, core.myId(), video ? 'Incoming video call' : 'Incoming call');
    timer = setTimeout(() => finish(get().phase === 'ringing' ? 'No answer' : 'Not reachable', true), RING_MS);
  } catch (e) {
    finish(e instanceof Error && (e.message === 'mic' || e.message === 'camera') ? 'Permission needed' : 'Couldn’t start call', true);
  }
}

export async function accept() {
  const c = get();
  if (c.phase !== 'incoming' || !offer) return;
  InCallManager.stopRingtone();
  Vibration.cancel();
  set({ phase: 'connecting' });
  try {
    const local = await media(c.video);
    set({ local });
    const p = connect(local);
    await p.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offer }));
    await flushIce();
    const a = await p.createAnswer();
    await p.setLocalDescription(a);
    send({ t: 'answer', cid: c.cid, sdp: a.sdp });
    InCallManager.start({ media: c.video ? 'video' : 'audio' });
    InCallManager.setForceSpeakerphoneOn(c.video);
    timer = setTimeout(() => get().phase !== 'live' && finish('Couldn’t connect', true), 30_000);
  } catch {
    finish('Couldn’t answer', true);
  }
}

export const decline = () => finish('Declined', true, 'decline');
export const hangUp = () => finish('Call ended', true);

export function toggleMute() {
  const muted = !get().muted;
  get()
    .local?.getAudioTracks()
    .forEach((t) => (t.enabled = !muted));
  set({ muted });
}
export function toggleSpeaker() {
  const speaker = !get().speaker;
  InCallManager.setForceSpeakerphoneOn(speaker);
  set({ speaker });
}
export function toggleCamera() {
  const camOff = !get().camOff;
  get()
    .local?.getVideoTracks()
    .forEach((t) => (t.enabled = !camOff));
  set({ camOff });
}
export const flipCamera = () =>
  get()
    .local?.getVideoTracks()
    .forEach((t) => t._switchCamera());

function log(c: Call, why: string) {
  const kind = c.video ? 'Video call' : 'Voice call';
  if (c.started) return core.logCall(c.peer, `${kind} · ${duration((Date.now() - c.started) / 1000)}`, c.outgoing);
  if (c.outgoing) return core.logCall(c.peer, `${kind} · ${why === 'Declined' ? 'Declined' : why === 'Busy' ? 'Busy' : 'No answer'}`, true);
  core.logCall(c.peer, `Missed ${kind.toLowerCase()}`, false);
}

function finish(note: string, tell: boolean, why: 'hangup' | 'decline' | 'busy' = 'hangup') {
  const c = get();
  if (c.phase === 'idle' || c.phase === 'ended') return;
  clearTimeout(timer);
  if (tell && c.peer) send({ t: 'end', cid: c.cid, why });
  c.local?.getTracks().forEach((t) => t.stop());
  pc?.close();
  pc = null;
  offer = null;
  pending = [];
  InCallManager.stopRingtone();
  InCallManager.stop();
  Vibration.cancel();
  if (c.peer) log(c, note);
  set({ phase: 'ended', note, local: null, remote: null });
  setTimeout(() => get().phase === 'ended' && set(IDLE), 1500);
}

async function onSig(peer: string, box: string) {
  let s: Sig;
  try {
    s = core.openFrom<Sig>(peer, box);
  } catch {
    return;
  }
  const c = get();
  if (s.t === 'offer') {
    if (core.contact(peer)?.state !== 'ok') return;
    if (s.cid === c.cid) return;
    if (c.phase !== 'idle' && c.phase !== 'ended') return signal(peer, core.sealFor(peer, { t: 'end', cid: s.cid, why: 'busy' } satisfies Sig));
    offer = s.sdp;
    pending = [];
    set({ ...IDLE, phase: 'incoming', cid: s.cid, peer, video: s.video, outgoing: false, speaker: s.video });
    signal(peer, core.sealFor(peer, { t: 'ring', cid: s.cid } satisfies Sig));
    InCallManager.startRingtone('_DEFAULT_', [0, 600, 900], 'playback', 40);
    Vibration.vibrate([0, 600, 900], true);
    timer = setTimeout(() => finish('Missed', false), RING_MS);
    router.push({ pathname: '/call/[id]', params: { id: peer } });
    return;
  }
  if (peer !== c.peer || s.cid !== c.cid) return;
  switch (s.t) {
    case 'ring':
      if (c.phase === 'calling') set({ phase: 'ringing' });
      break;
    case 'answer':
      InCallManager.stopRingback();
      set({ phase: 'connecting' });
      await pc?.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: s.sdp }));
      await flushIce();
      break;
    case 'ice':
      if (pc?.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(s.c)).catch(() => {});
      else pending.push(s);
      break;
    case 'end':
      finish(s.why === 'busy' ? 'Busy' : s.why === 'decline' ? 'Declined' : c.phase === 'incoming' ? 'Missed' : 'Call ended', false);
      break;
  }
}

// A closed phone misses the first offer; resend it, with gathered candidates, once the push brings it online.
function reoffer(online: Record<string, boolean>, before: Record<string, boolean>) {
  const c = get();
  const sdp = pc?.localDescription?.sdp;
  if (c.phase !== 'calling' || !sdp || !online[c.peer] || before[c.peer]) return;
  send({ t: 'offer', cid: c.cid, sdp, video: c.video });
  clearTimeout(timer);
  timer = setTimeout(() => finish(get().phase === 'ringing' ? 'No answer' : 'Not reachable', true), RING_MS);
}

export function startCalls() {
  handleSignals((peer, box) => void onSig(peer, box));
  useNet.subscribe((s, prev) => reoffer(s.online, prev.online));
}
