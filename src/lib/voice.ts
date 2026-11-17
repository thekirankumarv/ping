import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { create } from 'zustand';

// One player for every voice message; starting another stops the current one.
type Voice = { id: string | null; pos: number; playing: boolean; rate: number };
export const useVoice = create<Voice>()(() => ({ id: null, pos: 0, playing: false, rate: 1 }));

let player: ReturnType<typeof createAudioPlayer> | null = null;
function get() {
  if (player) return player;
  player = createAudioPlayer(null, { updateInterval: 120 });
  player.addListener('playbackStatusUpdate', (s) => {
    if (s.didJustFinish) {
      player!.pause();
      player!.seekTo(0);
      return useVoice.setState({ playing: false, pos: 0, id: null });
    }
    useVoice.setState({ pos: s.currentTime, playing: s.playing });
  });
  return player;
}

export async function toggle(id: string, uri: string) {
  const p = get();
  const v = useVoice.getState();
  if (v.id === id) return v.playing ? p.pause() : p.play();
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  p.replace({ uri });
  p.setPlaybackRate(v.rate);
  useVoice.setState({ id, pos: 0, playing: true });
  p.play();
}

export function seek(id: string, sec: number) {
  if (useVoice.getState().id !== id) return;
  get().seekTo(sec);
  useVoice.setState({ pos: sec });
}

export function cycleRate() {
  const rate = { 1: 1.5, 1.5: 2, 2: 1 }[useVoice.getState().rate] ?? 1;
  get().setPlaybackRate(rate);
  useVoice.setState({ rate });
}

export function stopVoice() {
  player?.pause();
  useVoice.setState({ id: null, playing: false, pos: 0 });
}
