import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createDefaultSong } from '../src/lib/defaultSong';
import {
  HISTORY_COALESCE_WINDOW_MS,
  applyProgressionPresetToSection,
  buildSongHistoryFingerprint,
  pushCoalescedUndoHistory,
  type CoalescedUndoState,
} from '../src/lib/sectionUtils';
import type { SongProject, SongSection } from '../src/types/song';

test('Phase 8E.1: applyProgressionPresetToSection preserves lyrics, melodyNotes, vocalAudio & extra bars', () => {
  const sampleSection: SongSection = {
    id: 'sec-verse-1',
    name: 'Verse',
    type: 'verse',
    intensity: 'medium',
    instruments: {
      guitarRhythm: true,
      guitarLead: false,
      bass: true,
      piano: true,
      drums: true,
    },
    bars: Array.from({ length: 6 }, (_, i) => ({
      id: `orig-bar-${i}`,
      chordsPerBar: (i === 2 ? 2 : 1) as 1 | 2,
      chords: i === 2 ? ['Am', 'G'] : ['Dm'],
      playStyle: (i === 5 ? 'let-ring' : 'normal') as 'normal' | 'let-ring',
      lyrics: `ท่อนร้องที่ ${i + 1}`,
      melodyNotes: [{ step: 0, durationSteps: 2, midiPitch: 60 + i }],
      vocalAudio: i === 4 ? 'data:audio/webm;base64,AAAABBBB' : undefined,
    })),
  };

  // Apply 4-chord preset to 6-bar section -> keeps all 6 bars and wraps chords without losing anything
  const updated = applyProgressionPresetToSection(sampleSection, ['C', 'G', 'Am', 'F']);
  assert.equal(updated.bars.length, 6);
  assert.deepEqual(
    updated.bars.map((b) => b.chords[0]),
    ['C', 'G', 'Am', 'F', 'C', 'G']
  );
  updated.bars.forEach((bar, i) => {
    assert.equal(bar.id, `orig-bar-${i}`);
    assert.equal(bar.lyrics, `ท่อนร้องที่ ${i + 1}`);
    assert.equal(bar.melodyNotes.length, 1);
    assert.equal(bar.melodyNotes[0].midiPitch, 60 + i);
  });
  assert.equal(updated.bars[4].vocalAudio, 'data:audio/webm;base64,AAAABBBB');
  assert.equal(updated.bars[5].playStyle, 'let-ring');

  // Apply 8-chord preset to 6-bar section -> keeps original 6 bars intact and appends 2 new unique bars
  const extended = applyProgressionPresetToSection(sampleSection, [
    'C',
    'G/B',
    'Am',
    'Em/G',
    'F',
    'C/E',
    'Dm7',
    'G7',
  ]);
  assert.equal(extended.bars.length, 8);
  assert.equal(extended.bars[4].vocalAudio, 'data:audio/webm;base64,AAAABBBB');
  assert.deepEqual(extended.bars[6].chords, ['Dm7']);
  assert.deepEqual(extended.bars[7].chords, ['G7']);
  assert.notEqual(extended.bars[6].id, extended.bars[7].id);
});

test('Phase 8E.2: buildSongHistoryFingerprint & pushCoalescedUndoHistory track full state and coalesce rapid bursts', () => {
  const base = createDefaultSong();
  const baseFp = buildSongHistoryFingerprint(base);

  // Detects vocalTakes, guitar acoustics, latency, countIn, metronome, folder, statusTag, per-bar vocalAudio
  const withTake: SongProject = {
    ...base,
    vocalTakes: [
      {
        id: 'take-1',
        name: 'Take 1',
        scope: 'section',
        audioDataUrl: 'data:audio/webm;base64,AAAA',
        startGlobalBarIndex: 0,
        endGlobalBarIndex: 3,
        preRollOffsetSec: 0,
        fxPreset: 'studio-warm',
        createdAt: '2026-11-18T12:00:00.000Z',
        isActive: true,
      },
    ],
  };
  assert.notEqual(buildSongHistoryFingerprint(withTake), baseFp);

  const withMetronome: SongProject = { ...base, metronomeEnabled: true };
  assert.notEqual(buildSongHistoryFingerprint(withMetronome), baseFp);

  const withBarVocal: SongProject = {
    ...base,
    sections: base.sections.map((s, sIdx) =>
      sIdx === 0
        ? {
            ...s,
            bars: s.bars.map((b, bIdx) =>
              bIdx === 0 ? { ...b, vocalAudio: 'data:audio/webm;base64,ZZZZ' } : b
            ),
          }
        : s
    ),
  };
  assert.notEqual(buildSongHistoryFingerprint(withBarVocal), baseFp);

  // Coalescing rapid BPM slider drags within 1200ms
  let state: CoalescedUndoState = { undoStack: [], lastKey: null, lastAtMs: 0 };
  const t0 = 10_000;
  const bpm91 = { ...base, bpm: 91 };
  const bpm95 = { ...base, bpm: 95 };
  const bpm102 = { ...base, bpm: 102 };

  const r1 = pushCoalescedUndoHistory(state, base, bpm91, t0);
  assert.equal(r1.pushed, true);
  assert.equal(r1.coalesced, false);
  state = r1.state;
  assert.equal(state.undoStack.length, 1);
  assert.equal(state.undoStack[0].bpm, base.bpm);

  const r2 = pushCoalescedUndoHistory(state, bpm91, bpm95, t0 + 300);
  assert.equal(r2.pushed, false);
  assert.equal(r2.coalesced, true);
  state = r2.state;
  assert.equal(state.undoStack.length, 1);

  const r3 = pushCoalescedUndoHistory(state, bpm95, bpm102, t0 + 700);
  assert.equal(r3.pushed, false);
  assert.equal(r3.coalesced, true);
  state = r3.state;
  assert.equal(state.undoStack.length, 1, 'Continuous BPM drags within 1.2s must collapse into 1 undo step');
  assert.equal(state.undoStack[0].bpm, base.bpm);

  // After > 1200ms window, next BPM edit pushes a second snapshot
  const bpm115 = { ...base, bpm: 115 };
  const r4 = pushCoalescedUndoHistory(
    state,
    bpm102,
    bpm115,
    t0 + 700 + HISTORY_COALESCE_WINDOW_MS + 100
  );
  assert.equal(r4.pushed, true);
  assert.equal(r4.state.undoStack.length, 2);
  assert.equal(r4.state.undoStack[1].bpm, 102);

  // Structural edits do NOT coalesce even within 1200ms
  const structEdit: SongProject = {
    ...bpm115,
    sections: bpm115.sections.map((s, idx) =>
      idx === 0
        ? {
            ...s,
            bars: s.bars.map((b, bIdx) => (bIdx === 0 ? { ...b, chords: ['Fmaj7'] } : b)),
          }
        : s
    ),
  };
  const r5 = pushCoalescedUndoHistory(
    r4.state,
    bpm115,
    structEdit,
    t0 + 700 + HISTORY_COALESCE_WINDOW_MS + 200
  );
  assert.equal(r5.pushed, true);
  assert.equal(r5.coalesced, false);
  assert.equal(r5.state.undoStack.length, 3);
});

test('Phase 8E.3: AudioEngine & hook wire real Count-In, Metronome Click, and previewChord', () => {
  const root = process.cwd();
  const typesSrc = fs.readFileSync(path.join(root, 'src/types/song.ts'), 'utf8');
  const engineSrc = fs.readFileSync(path.join(root, 'src/lib/audioEngine.ts'), 'utf8');
  const hookSrc = fs.readFileSync(path.join(root, 'src/hooks/useAudioEngine.ts'), 'utf8');

  assert.match(typesSrc, /metronomeEnabled\?:\s*boolean/);
  assert.match(engineSrc, /isCountIn\?:\s*boolean/);
  assert.match(engineSrc, /isCountInFlag\s*=\s*true/);
  assert.match(engineSrc, /clickSynth\s*=\s*new DrumSynth\(ctx,\s*dest\)/);
  assert.match(engineSrc, /setMetronomeEnabled\(enabled:\s*boolean\)/);
  assert.match(engineSrc, /previewChord\(chordSymbol:\s*string/);
  assert.match(engineSrc, /getGuitarVoicing\(soundingChord/);
  assert.match(hookSrc, /isCountIn:\s*Boolean\(status\.isCountIn\)/);
  assert.match(hookSrc, /metronomeEnabled:\s*Boolean\(status\.metronomeEnabled/);
  assert.match(hookSrc, /previewChord/);
});

test('Phase 8E.4: TransportBar, ChordPickerModal & SoundCustomizerPanel expose complete audio/UX controls', () => {
  const root = process.cwd();
  const transportSrc = fs.readFileSync(path.join(root, 'src/components/TransportBar.tsx'), 'utf8');
  const chordPickerSrc = fs.readFileSync(path.join(root, 'src/components/ChordPickerModal.tsx'), 'utf8');
  const soundPanelSrc = fs.readFileSync(path.join(root, 'src/components/SoundCustomizerPanel.tsx'), 'utf8');

  // TransportBar: Loading indicator, Escape dialog guard, Metronome toggle, BPM 50-180 + Tap Tempo, Easy Mode & New Song
  assert.match(transportSrc, /กำลังโหลดเสียงเครื่องดนตรี\.\.\./);
  assert.match(transportSrc, /hasOpenModal/);
  assert.match(transportSrc, /\[role="dialog"\], \.fixed\.inset-0/);
  assert.match(transportSrc, /metronomeEnabled/);
  assert.match(transportSrc, /Tap Tempo/);
  assert.match(transportSrc, /min=\{50\}[\s\S]*?max=\{180\}/);
  assert.match(transportSrc, /onOpenEasyMode/);
  assert.match(transportSrc, /onCreateNewSong/);

  // ChordPickerModal: chord audition preview + explicit listen button
  assert.match(chordPickerSrc, /onPreviewChord/);
  assert.match(chordPickerSrc, /ฟังเสียงคอร์ด/);

  // SoundCustomizerPanel: inline Play/Stop + Solo across tracks
  assert.match(soundPanelSrc, /onTogglePlay/);
  assert.match(soundPanelSrc, /onStop/);
  assert.match(soundPanelSrc, /handleToggleSolo/);
  assert.match(soundPanelSrc, /preSoloEnabledRef/);
  assert.match(soundPanelSrc, /renderSoloButton\('guitarRhythm'\)/);
  assert.match(soundPanelSrc, /renderSoloButton\('vocal'\)/);
});

test('Phase 8E.5: SectionBuilder, EasyMode, AdvanceMode, MiniPianoRoll, VocalRecorder & page.tsx wire non-mutating previews & Dark Mode tokens', () => {
  const root = process.cwd();
  const pageSrc = fs.readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');
  const sectionSrc = fs.readFileSync(path.join(root, 'src/components/SectionBuilder.tsx'), 'utf8');
  const easySrc = fs.readFileSync(path.join(root, 'src/components/EasyModeStarterModal.tsx'), 'utf8');
  const advanceSrc = fs.readFileSync(path.join(root, 'src/components/AdvanceModeModal.tsx'), 'utf8');
  const pianoSrc = fs.readFileSync(path.join(root, 'src/components/MiniPianoRollModal.tsx'), 'utf8');
  const vocalSrc = fs.readFileSync(path.join(root, 'src/components/VocalRecorderModal.tsx'), 'utf8');

  // page.tsx integrations
  assert.match(pageSrc, /const isCountIn = engine\.isCountIn;/);
  assert.match(pageSrc, /pushCoalescedUndoHistory/);
  assert.match(pageSrc, /applyProgressionPresetToSection/);
  assert.match(pageSrc, /applyMode === 'overwrite-current'/);
  assert.match(pageSrc, /handleCreateNewSong/);
  assert.match(pageSrc, /onPreviewChord=\{engine\.previewChord\}/);
  assert.match(pageSrc, /onOpenRhymeDictionary=/);

  // SectionBuilder: progressive bar disclosure, free 0-Cr tools outside AI menu, seekToBar, non-mutating rhythm preview
  assert.match(sectionSrc, /focusedBarId/);
  assert.match(sectionSrc, /showAllBarTools/);
  assert.match(sectionSrc, /พจนานุกรมสัมผัสไทย \(ฟรี 0 Cr\)/);
  assert.match(sectionSrc, /วางเนื้อร้องแบ่งห้อง \(ฟรี 0 Cr\)/);
  assert.match(sectionSrc, /onSeekToBar/);
  assert.doesNotMatch(
    sectionSrc,
    /🔊 ฟังจังหวะคำร้อง[\s\S]{0,600}onUpdateSong\(\(\) => updatedSongForPlayback\)/,
    '🔊 ฟังจังหวะคำร้อง must preview without calling onUpdateSong'
  );

  // EasyModeStarterModal: default new-song creation option
  assert.match(easySrc, /useState<'new-song' \| 'overwrite-current'>\('new-song'\)/);
  assert.match(easySrc, /สร้างเป็นเพลงใหม่ในคลัง/);

  // AdvanceModeModal: preview before save + Dark Mode tokens
  assert.match(advanceSrc, /บันทึกเสียงนี้ลงห้อง/);
  assert.match(advanceSrc, /bg-surface-1/);
  assert.doesNotMatch(
    advanceSrc,
    /const handleSingLineWithAi = async [\s\S]{0,1800}onApplySectionVocalAudio\(/,
    'handleSingLineWithAi must store preview audio without auto-mutating song sections'
  );

  // Touch-visible piano roll duration buttons + Dark Mode tokens across PianoRoll & VocalRecorder
  assert.match(pianoSrc, /opacity-100 sm:opacity-0 sm:group-hover:opacity-100/);
  assert.match(pianoSrc, /bg-surface-1/);
  assert.match(pianoSrc, /text-ink-900/);
  assert.match(vocalSrc, /bg-surface-1/);
  assert.match(vocalSrc, /text-ink-900/);
});
