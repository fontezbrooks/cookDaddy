// Audio wrapper (P8 Slice 3). Mirrors src/lib/haptics.ts — one place
// owns the "should this sound fire?" decision. Every caller invokes the
// relevant method and the wrapper checks useSettingsStore.soundsEnabled
// before forwarding to expo-audio. MATCH-UX §6 (default OFF, opt-in).
//
// The wrapper is intentionally NOT a hook — it's read-anywhere, including
// inside Reanimated worklet callbacks via runOnJS where hook calls would
// be ill-formed. The store read is a synchronous snapshot.
//
// Asset binding (MATCH-UX §6, v1 placeholder OK; sound designer pre-launch):
//   The actual chime asset doesn't ship in this slice — once an MP3
//   drops into `assets/sounds/match-reveal.mp3`, replace the `null` in
//   MATCH_REVEAL_ASSET with `require('@/assets/sounds/match-reveal.mp3')`
//   and the play path activates. Until then, every call no-ops silently.
//   Tests can inject a stub source via __setSourceForTests.

import { createAudioPlayer, type AudioPlayer, type AudioSource } from 'expo-audio';

import { useSettingsStore } from '@/state/useSettingsStore';

function enabled(): boolean {
  return useSettingsStore.getState().soundsEnabled;
}

// Lazy player cache. Each sound's player is created on first use and
// reused for subsequent plays so we don't re-parse the asset every time.
type PlayerCacheEntry = AudioPlayer | null;
const players = new Map<string, PlayerCacheEntry>();

// Asset sources. Production wires these to bundled MP3s via require();
// for now everything is `null` so every call no-ops gracefully until
// the audio designer pre-launch pass per MATCH-UX §6.
const sources: Record<string, AudioSource | null> = {
  'match-reveal': null,
};

function getPlayer(key: string): AudioPlayer | null {
  if (players.has(key)) return players.get(key) ?? null;
  const source = sources[key];
  if (source == null) {
    players.set(key, null);
    return null;
  }
  try {
    const p = createAudioPlayer(source);
    players.set(key, p);
    return p;
  } catch {
    // Failed to load the asset — register null so we don't retry.
    players.set(key, null);
    return null;
  }
}

function playKey(key: string): void {
  if (!enabled()) return;
  const player = getPlayer(key);
  if (!player) return;
  try {
    player.seekTo(0);
    player.play();
  } catch {
    // Silent bail; audio is polish, not correctness.
  }
}

export const audio = {
  // MATCH-UX §6 row "Match reveal — two-note chime ~500ms".
  playMatchReveal(): void {
    playKey('match-reveal');
  },
};

// Test-only helper: inject a fake source so the play path can be
// exercised under jest without a real bundled asset. Resets the player
// cache so the next call re-creates with the new source.
export function __setSourceForTests(key: string, source: AudioSource | null): void {
  sources[key] = source;
  players.delete(key);
}

// Test-only helper: reset internal caches between tests so behavior is
// isolated. Mirrors the reset helpers other singletons expose.
export function __resetAudioForTests(): void {
  players.clear();
  for (const k of Object.keys(sources)) sources[k] = null;
}
