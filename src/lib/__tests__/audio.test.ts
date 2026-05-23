/**
 * Audio chokepoint (P8 Slice 3). Mirrors haptics.test.ts.
 *
 * Contract:
 *   • playMatchReveal() no-ops when useSettingsStore.soundsEnabled is false.
 *   • playMatchReveal() no-ops when no asset has been bound for the key
 *     (the v1 default — asset binding is a pre-launch task per §6).
 *   • playMatchReveal() creates an AudioPlayer once per key and reuses it
 *     for subsequent plays (no re-parse on every fire).
 *   • Successive plays call seekTo(0) + play() so the chime restarts.
 */

import { audio, __resetAudioForTests, __setSourceForTests } from '@/lib/audio';
import { __resetSettingsStoreForTests, useSettingsStore } from '@/state/useSettingsStore';

type MockPlayer = { play: jest.Mock; seekTo: jest.Mock };
const expoAudio = require('expo-audio') as {
  createAudioPlayer: jest.Mock;
  __getCreatedPlayers: () => MockPlayer[];
  __resetMockPlayers: () => void;
};

const FAKE_SOURCE = 42 as unknown as Parameters<typeof __setSourceForTests>[1];

describe('audio', () => {
  beforeEach(async () => {
    expoAudio.__resetMockPlayers();
    __resetAudioForTests();
    await __resetSettingsStoreForTests();
    // Default settings ship with sounds OFF (MATCH-UX §6); flip on for
    // the happy-path tests, individual tests can toggle back.
    useSettingsStore.getState().setSoundsEnabled(true);
  });

  it('does not call createAudioPlayer when soundsEnabled is false', () => {
    useSettingsStore.getState().setSoundsEnabled(false);
    __setSourceForTests('match-reveal', FAKE_SOURCE);

    audio.playMatchReveal();

    expect(expoAudio.createAudioPlayer).not.toHaveBeenCalled();
  });

  it('does not call createAudioPlayer when no asset source is bound', () => {
    // No __setSourceForTests call — sources['match-reveal'] is null.
    audio.playMatchReveal();
    expect(expoAudio.createAudioPlayer).not.toHaveBeenCalled();
  });

  it('creates an AudioPlayer once and reuses it on subsequent plays', () => {
    __setSourceForTests('match-reveal', FAKE_SOURCE);

    audio.playMatchReveal();
    audio.playMatchReveal();
    audio.playMatchReveal();

    expect(expoAudio.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(expoAudio.createAudioPlayer).toHaveBeenCalledWith(FAKE_SOURCE);
  });

  it('seeks to 0 and plays so each chime restarts from the beginning', () => {
    __setSourceForTests('match-reveal', FAKE_SOURCE);

    audio.playMatchReveal();
    audio.playMatchReveal();

    const [player] = expoAudio.__getCreatedPlayers();
    expect(player).toBeDefined();
    expect(player!.seekTo).toHaveBeenCalledTimes(2);
    expect(player!.seekTo).toHaveBeenCalledWith(0);
    expect(player!.play).toHaveBeenCalledTimes(2);
  });

  it('survives a createAudioPlayer throw without propagating', () => {
    expoAudio.createAudioPlayer.mockImplementationOnce(() => {
      throw new Error('synthetic audio init failure');
    });
    __setSourceForTests('match-reveal', FAKE_SOURCE);

    expect(() => audio.playMatchReveal()).not.toThrow();
    // The bad attempt cached `null`, so a second call won't retry init.
    audio.playMatchReveal();
    expect(expoAudio.createAudioPlayer).toHaveBeenCalledTimes(1);
  });
});
