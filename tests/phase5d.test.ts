import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createDefaultSong } from '../src/lib/defaultSong';
import { getTiming } from '../src/lib/barPlanner';
import {
  AUTO_DUCK_GAIN_MULTIPLIER,
  activateVocalTake,
  addAndActivateVocalTake,
  clampVocalLatencyMs,
  computeAutoDuckFactor,
  computePreRollPlaybackPlan,
  computeTakePlaybackSlice,
  formatNextTakeName,
  getSectionBarRange,
  removeVocalTake,
} from '../src/lib/vocalBoothUtils';
import { MicRecorder } from '../src/lib/micRecorder';
import {
  clearSongVocals,
  getVocalBlob,
  hydrateSongVocalsFromIdb,
  makeVocalTakeBlobKey,
  persistSongVocalsToIdb,
} from '../src/lib/audioStorageIdb';
import {
  createSongSnapshot,
  restoreSongFromSnapshot,
  stripVocalsFromSong,
} from '../src/lib/storage';
import { generateShareUrl, parseSongFromUrl } from '../src/lib/shareUrl';
import { translations } from '../src/lib/i18n';
import type { VocalTake } from '../src/types/song';

function buildTwoSectionSong() {
  const base = createDefaultSong();
  const secA = {
    ...base.sections[0],
    id: 'sec-verse',
    name: 'Verse',
    bars: base.sections[0].bars.slice(0, 4).map((b, i) => ({
      ...b,
      id: `v-bar-${i}`,
      lyrics: `Verse line ${i + 1}`,
    })),
  };
  const secB = {
    ...base.sections[0],
    id: 'sec-chorus',
    name: 'Chorus',
    bars: base.sections[0].bars.slice(0, 4).map((b, i) => ({
      ...b,
      id: `c-bar-${i}`,
      lyrics: `Chorus line ${i + 1}`,
    })),
  };
  return {
    ...base,
    id: 'song-phase5d-test',
    bpm: 120,
    timeSignature: '4/4' as const,
    sections: [secA, secB],
  };
}

test('vocalBoothUtils computes full-song and section bar ranges accurately', () => {
  const song = buildTwoSectionSong();
  const fullRange = getSectionBarRange(song, 'full-song');
  assert.equal(fullRange.startGlobalBarIndex, 0);
  assert.equal(fullRange.endGlobalBarIndex, 7);
  assert.equal(fullRange.barCount, 8);

  const chorusRange = getSectionBarRange(song, 'section', 'sec-chorus');
  assert.equal(chorusRange.startGlobalBarIndex, 4);
  assert.equal(chorusRange.endGlobalBarIndex, 7);
  assert.equal(chorusRange.barCount, 4);
  assert.equal(chorusRange.sectionName, 'Chorus');
});

test('computePreRollPlaybackPlan handles mid-song 1-bar backing pre-roll, bar-0 count-in, and disabled pre-roll', () => {
  const song = buildTwoSectionSong();
  const { barSec } = getTiming(song); // 120 BPM 4/4 => 2.0 sec/bar

  const chorusPreRoll = computePreRollPlaybackPlan(song, 'section', 'sec-chorus', true);
  assert.equal(chorusPreRoll.targetStartBarIndex, 4);
  assert.equal(chorusPreRoll.playbackStartBarIndex, 3); // 1 bar earlier
  assert.equal(chorusPreRoll.preRollMode, 'backing-bar');
  assert.equal(chorusPreRoll.useCountIn, false);
  assert.equal(chorusPreRoll.preRollOffsetSec, barSec);

  const fullPreRoll = computePreRollPlaybackPlan(song, 'full-song', undefined, true);
  assert.equal(fullPreRoll.targetStartBarIndex, 0);
  assert.equal(fullPreRoll.playbackStartBarIndex, 0);
  assert.equal(fullPreRoll.preRollMode, 'count-in');
  assert.equal(fullPreRoll.useCountIn, true);
  assert.equal(fullPreRoll.preRollOffsetSec, barSec);

  const noPreRoll = computePreRollPlaybackPlan(song, 'section', 'sec-chorus', false);
  assert.equal(noPreRoll.playbackStartBarIndex, 4);
  assert.equal(noPreRoll.preRollMode, 'none');
  assert.equal(noPreRoll.preRollOffsetSec, 0);
});

test('computeTakePlaybackSlice aligns take on bar-0 play, mid-take seek, bluetooth negative latency, and past-end seek', () => {
  const song = buildTwoSectionSong();
  const { barSec } = getTiming(song); // 2.0 sec
  const chorusTake: VocalTake = {
    id: 'tk-chorus-1',
    name: 'Take 1 — Chorus',
    scope: 'section',
    sectionId: 'sec-chorus',
    startGlobalBarIndex: 4,
    endGlobalBarIndex: 7,
    preRollOffsetSec: barSec,
    latencyOffsetMs: 0,
    audioDataUrl: 'data:audio/webm;base64,ZmFrZQ==',
    fxPreset: 'studio-warm',
    isActive: true,
    createdAt: '2026-11-14T00:00:00.000Z',
  };

  // Play from bar 0
  const fromStart = computeTakePlaybackSlice(song, chorusTake, 0);
  assert.equal(fromStart.shouldPlay, true);
  assert.equal(fromStart.delaySec, 4 * barSec);
  assert.equal(fromStart.bufferOffsetSec, barSec);

  // Seek mid-take to bar 6
  const fromBar6 = computeTakePlaybackSlice(song, chorusTake, 6);
  assert.equal(fromBar6.shouldPlay, true);
  assert.equal(fromBar6.delaySec, 0);
  assert.equal(fromBar6.bufferOffsetSec, barSec + 2 * barSec);

  // Full song take with -100ms Bluetooth pull compensation at bar 0
  const btTake: VocalTake = {
    ...chorusTake,
    id: 'tk-full-bt',
    scope: 'full-song',
    startGlobalBarIndex: 0,
    endGlobalBarIndex: 7,
    latencyOffsetMs: -100,
  };
  const btSlice = computeTakePlaybackSlice(song, btTake, 0);
  assert.equal(btSlice.shouldPlay, true);
  assert.equal(btSlice.delaySec, 0);
  assert.ok(Math.abs(btSlice.bufferOffsetSec - (barSec + 0.1)) < 1e-6);

  // Out of bounds after take end
  const pastChorus = computeTakePlaybackSlice(song, chorusTake, 8);
  assert.equal(pastChorus.shouldPlay, false);
});

test('multi-take comping activates selected take while muting overlapping takes and preserving non-overlapping takes', () => {
  const song = buildTwoSectionSong();
  const verseTake: VocalTake = {
    id: 'tk-v1',
    name: 'Take 1 — Verse',
    scope: 'section',
    sectionId: 'sec-verse',
    startGlobalBarIndex: 0,
    endGlobalBarIndex: 3,
    preRollOffsetSec: 2,
    audioDataUrl: 'data:audio/webm;base64,djE=',
    fxPreset: 'studio-warm',
    isActive: true,
    createdAt: '2026-11-14T00:00:00.000Z',
  };
  const chorusTake1: VocalTake = {
    ...verseTake,
    id: 'tk-c1',
    name: 'Take 1 — Chorus',
    sectionId: 'sec-chorus',
    startGlobalBarIndex: 4,
    endGlobalBarIndex: 7,
  };
  const chorusTake2: VocalTake = {
    ...chorusTake1,
    id: 'tk-c2',
    name: formatNextTakeName(song, [verseTake, chorusTake1], 'section', 'sec-chorus'),
  };
  assert.equal(chorusTake2.name, 'Take 2 — Chorus');

  const added = addAndActivateVocalTake([verseTake, chorusTake1], chorusTake2, 8);
  assert.equal(added.find((t) => t.id === 'tk-v1')?.isActive, true);
  assert.equal(added.find((t) => t.id === 'tk-c1')?.isActive, false);
  assert.equal(added.find((t) => t.id === 'tk-c2')?.isActive, true);

  const fullTake: VocalTake = {
    id: 'tk-full',
    name: 'Take 1 — Full Song',
    scope: 'full-song',
    startGlobalBarIndex: 0,
    endGlobalBarIndex: 7,
    preRollOffsetSec: 2,
    audioDataUrl: 'data:audio/webm;base64,ZnVsbA==',
    fxPreset: 'wide-chorus',
    isActive: false,
    createdAt: '2026-11-14T00:00:00.000Z',
  };
  const withFull = activateVocalTake([...added, fullTake], 'tk-full', 8);
  assert.equal(withFull.find((t) => t.id === 'tk-v1')?.isActive, false);
  assert.equal(withFull.find((t) => t.id === 'tk-c2')?.isActive, false);
  assert.equal(withFull.find((t) => t.id === 'tk-full')?.isActive, true);

  const removed = removeVocalTake(withFull, 'tk-full');
  assert.equal(removed.some((t) => t.id === 'tk-full'), false);
});

test('computeAutoDuckFactor reduces backing mix during active vocal bars and respects toggle/mute', () => {
  const song = buildTwoSectionSong();
  const chorusTake: VocalTake = {
    id: 'tk-c1',
    name: 'Take 1 — Chorus',
    scope: 'section',
    sectionId: 'sec-chorus',
    startGlobalBarIndex: 4,
    endGlobalBarIndex: 7,
    preRollOffsetSec: 2,
    audioDataUrl: 'data:audio/webm;base64,ZmFrZQ==',
    fxPreset: 'studio-warm',
    isActive: true,
    createdAt: '2026-11-14T00:00:00.000Z',
  };
  song.vocalTakes = [chorusTake];
  song.mixer.vocal = { enabled: true, volume: 95, autoDucking: true };

  const bar0 = { index: 0, sectionIndex: 0, barInSection: 0, section: song.sections[0], bar: song.sections[0].bars[0], isFirstOfSection: true, isLastOfSection: false };
  const bar4 = { index: 4, sectionIndex: 1, barInSection: 0, section: song.sections[1], bar: song.sections[1].bars[0], isFirstOfSection: true, isLastOfSection: false };

  assert.equal(computeAutoDuckFactor(song, bar0, 0), 1.0);
  assert.equal(computeAutoDuckFactor(song, bar4, 4), AUTO_DUCK_GAIN_MULTIPLIER);

  song.mixer.vocal.autoDucking = false;
  assert.equal(computeAutoDuckFactor(song, bar4, 4), 1.0);

  song.mixer.vocal.autoDucking = true;
  song.mixer.vocal.enabled = false;
  assert.equal(computeAutoDuckFactor(song, bar4, 4), 1.0);

  assert.equal(clampVocalLatencyMs(-999), -150);
  assert.equal(clampVocalLatencyMs(999), 250);
});

test('MicRecorder.buildAudioConstraints toggles DSP cleanly for studio headphones vs tablet speakers', () => {
  const headphoneConstraints = MicRecorder.buildAudioConstraints(true);
  assert.deepEqual(headphoneConstraints, {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  });

  const speakerConstraints = MicRecorder.buildAudioConstraints(false);
  assert.deepEqual(speakerConstraints, {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: false,
  });
});

test('IndexedDB vocal take offload, stripping, snapshot restore, and LINE share stripping work seamlessly', async () => {
  const song = buildTwoSectionSong();
  const sampleTakeData = 'data:audio/webm;codecs=opus;base64,T2dnUwACAAAAAAAAAAA=';
  song.vocalTakes = [
    {
      id: 'tk-idb-1',
      name: 'Take 1 — Full Song',
      scope: 'full-song',
      startGlobalBarIndex: 0,
      endGlobalBarIndex: 7,
      preRollOffsetSec: 2,
      latencyOffsetMs: -40,
      audioDataUrl: sampleTakeData,
      fxPreset: 'studio-warm',
      isActive: true,
      createdAt: '2026-11-14T00:00:00.000Z',
    },
  ];

  // Key format shares songId_ prefix with clearSongVocals
  const key = makeVocalTakeBlobKey(song.id, 'tk-idb-1');
  assert.equal(key, `${song.id}_take_tk-idb-1`);

  await persistSongVocalsToIdb(song);
  const storedRaw = await getVocalBlob(key);
  assert.equal(storedRaw, sampleTakeData);

  // Strip before localStorage write
  const stripped = stripVocalsFromSong(song);
  assert.equal(stripped.vocalTakes?.[0].audioDataUrl, undefined);
  assert.equal(stripped.vocalTakes?.[0].id, 'tk-idb-1');

  // Rehydrate from fallback/IndexedDB store
  const hydrated = await hydrateSongVocalsFromIdb(stripped);
  assert.equal(hydrated.vocalTakes?.[0].audioDataUrl, sampleTakeData);

  // Snapshot creation strips take blob, restore preserves live vocalTakes
  const snap = createSongSnapshot(song, 'Checkpoint 1');
  const snapParsed = JSON.parse(snap.songData);
  assert.equal(snapParsed.vocalTakes?.[0]?.audioDataUrl, undefined);
  const restored = restoreSongFromSnapshot(song, snap);
  assert.equal(restored?.vocalTakes?.[0]?.audioDataUrl, sampleTakeData);

  // Share URL drops vocalTakes altogether so link fits LINE/mobile
  const shareUrl = generateShareUrl(song);
  const queryPart = shareUrl.split('?')[1] || '';
  const parsedShared = parseSongFromUrl(queryPart);
  assert.ok(parsedShared);
  assert.equal(parsedShared.vocalTakes, undefined);

  await clearSongVocals(song.id);
  const clearedRaw = await getVocalBlob(key);
  assert.equal(clearedRaw, null);
});

test('Phase 5D i18n keys and UI/audio wiring contracts are complete', () => {
  const thKeys = Object.keys(translations.th);
  const enKeys = Object.keys(translations.en);
  assert.deepEqual(thKeys, enKeys);
  assert.ok(translations.th.vocalBoothTitle.includes('Vocal Booth'));
  assert.ok(translations.en.vocalBoothFreeBadge.includes('0 Credits'));

  const engineSrc = fs.readFileSync(path.join(process.cwd(), 'src/lib/audioEngine.ts'), 'utf8');
  assert.ok(engineSrc.includes('setFxPreset(preset: VocalFxPreset)'));
  assert.ok(engineSrc.includes("'dry-natural'"));
  assert.ok(engineSrc.includes("'wide-chorus'"));
  assert.ok(engineSrc.includes('computeTakePlaybackSlice'));
  assert.ok(engineSrc.includes('computeAutoDuckFactor'));
  assert.ok(engineSrc.includes('activeTakeSources'));

  const pageSrc = fs.readFileSync(path.join(process.cwd(), 'src/app/page.tsx'), 'utf8');
  assert.ok(pageSrc.includes("'vocal-recorded'"));
  assert.ok(pageSrc.includes('onStartBoothPlayback'));

  const karaokeSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/KaraokeTeleprompter.tsx'),
    'utf8'
  );
  assert.ok(karaokeSrc.includes('VocalBoothControls'));

  const mixerSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/SoundCustomizerPanel.tsx'),
    'utf8'
  );
  assert.ok(mixerSrc.includes('VOCAL_FX_PRESETS'));
  assert.ok(mixerSrc.includes('autoDucking'));
});
