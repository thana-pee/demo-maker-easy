import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  SONGWRITER_STYLE_PROFILES,
  MASTER_LYRIC_FEW_SHOT_BANK,
  buildDynamicLyricFewShots,
  buildLyricsSystemPrompt,
  getSyllableBudgetForBpm,
} from '../src/lib/aiPrompts';
import {
  VALID_SONGWRITER_STYLES,
  applyGenreBandArrangement,
  buildSimulatedArchitectSong,
  buildStyledSimulatedSongLyrics,
  sanitizeArchitectSongProject,
} from '../src/lib/songArchitect';
import { shiftLastTokenToNextBar } from '../src/lib/sectionUtils';
import { validateThaiLyricCouplets } from '../src/lib/thaiRhymeHelper';
import type { SongBar } from '../src/types/song';

test('Phase 7A: aed-carabao and asanee-chotikul profiles, few-shot exemplars & syllable budgets', () => {
  assert.equal(SONGWRITER_STYLE_PROFILES.length, 20);
  assert.equal(Object.keys(MASTER_LYRIC_FEW_SHOT_BANK.songwriters).length, 20);
  assert.ok(VALID_SONGWRITER_STYLES.has('aed-carabao'));
  assert.ok(VALID_SONGWRITER_STYLES.has('asanee-chotikul'));

  const aedProfile = SONGWRITER_STYLE_PROFILES.find((p) => p.id === 'aed-carabao');
  const asaneeProfile = SONGWRITER_STYLE_PROFILES.find((p) => p.id === 'asanee-chotikul');
  assert.ok(aedProfile);
  assert.ok(asaneeProfile);
  assert.match(aedProfile.label, /แอ๊ด คาราบาว/);
  assert.match(asaneeProfile.label, /อัสนี โชติกุล/);

  // Invariant: 74 BPM default must still keep '5-8 พยางค์'
  const baselineBudget = getSyllableBudgetForBpm(74, '4/4');
  assert.ok(baselineBudget.guidance.includes('5-8 พยางค์'));
  const baselinePrompt = buildLyricsSystemPrompt({
    bpm: 74,
    timeSignature: '4/4',
    sectionType: 'chorus',
  });
  assert.ok(baselinePrompt.includes('5-8 พยางค์'));

  // Style-specific budgets
  const aedBudget = getSyllableBudgetForBpm(92, '4/4', { songwriterStyle: 'aed-carabao' });
  assert.equal(aedBudget.min, 6);
  assert.equal(aedBudget.max, 11);

  const asaneeBudget = getSyllableBudgetForBpm(100, '4/4', {
    songwriterStyle: 'asanee-chotikul',
  });
  assert.equal(asaneeBudget.min, 5);
  assert.equal(asaneeBudget.max, 9);

  const aedPrompt = buildLyricsSystemPrompt({
    bpm: 92,
    timeSignature: '4/4',
    sectionType: 'chorus',
    songwriterStyle: 'aed-carabao',
  });
  assert.match(aedPrompt, /แอ๊ด คาราบาว/);
  assert.match(buildDynamicLyricFewShots({ songwriterStyle: 'aed-carabao' }), /แอ๊ด คาราบาว/);

  const asaneePrompt = buildLyricsSystemPrompt({
    bpm: 100,
    timeSignature: '4/4',
    sectionType: 'chorus',
    songwriterStyle: 'asanee-chotikul',
  });
  assert.match(asaneePrompt, /อัสนี โชติกุล/);
  assert.match(
    buildDynamicLyricFewShots({ songwriterStyle: 'asanee-chotikul' }),
    /อัสนี โชติกุล/
  );
});

test('Phase 7A: buildStyledSimulatedSongLyrics & sanitizeArchitectSongProject for aed-carabao and asanee-chotikul', () => {
  for (const style of ['aed-carabao', 'asanee-chotikul'] as const) {
    const bundle = buildStyledSimulatedSongLyrics({
      topic: 'เส้นทางชีวิต',
      mood: 'empowering',
      language: 'th',
      thaiGenre: style === 'aed-carabao' ? 'phuea-chiwit' : 'thai-rock',
      songwriterStyle: style,
    });

    assert.ok(bundle.verse.length >= 4);
    assert.ok(bundle['pre-chorus'].length >= 2);
    assert.ok(bundle.chorus.length >= 4);
    assert.ok(bundle.bridge.length >= 2);
    assert.ok(bundle.outro.length >= 2);
    assert.ok(bundle.outro.every((line) => line.trim().length > 0));

    const verseRhyme = validateThaiLyricCouplets(bundle.verse.slice(0, 4));
    assert.equal(verseRhyme.passed, true, `Expected verse rhyme to pass for ${style}`);
    assert.ok((verseRhyme.chainContinuityRatio ?? 0) >= 0.67);

    const chorusRhyme = validateThaiLyricCouplets(bundle.chorus.slice(0, 4));
    assert.equal(chorusRhyme.passed, true, `Expected chorus rhyme to pass for ${style}`);
    assert.ok((chorusRhyme.chainContinuityRatio ?? 0) >= 0.67);

    const simulated = buildSimulatedArchitectSong({
      stylePreset: style === 'aed-carabao' ? 'phuea-chiwit-road' : 'thai-rock-90s',
      vocalProfile: 'male',
      tempoFeel: 'medium',
      topic: 'นักสู้หัวใจแกร่ง',
      language: 'th',
      thaiGenre: style === 'aed-carabao' ? 'phuea-chiwit' : 'thai-rock',
      songwriterStyle: style,
    });
    assert.equal(simulated.songwriterStyle, style);

    const sanitizedFromRaw = sanitizeArchitectSongProject(
      { songwriterStyle: style, title: 'Test', bpm: 96, baseKey: 'C', sections: simulated.sections },
      {
        stylePreset: 'thai-rock-90s',
        vocalProfile: 'male',
        tempoFeel: 'medium',
        topic: 'Test',
        language: 'th',
        songwriterStyle: 'none',
      }
    );
    assert.equal(sanitizedFromRaw.songwriterStyle, style);
  }
});

test('Phase 7A: shiftLastTokenToNextBar shifts trailing word/syllable cleanly & preserves chords/notes/vocals', () => {
  const sampleBars: SongBar[] = [
    {
      id: 'b1',
      chordsPerBar: 2,
      chords: ['C', 'G'],
      playStyle: 'let-ring',
      lyrics: 'ยังคิดถึงเธอ เสมอ',
      melodyNotes: [{ step: 0, midiPitch: 64, durationSteps: 4 }],
      vocalAudio: 'data:audio/webm;base64,AAA',
    },
    {
      id: 'b2',
      chordsPerBar: 1,
      chords: ['Am'],
      playStyle: 'normal',
      lyrics: 'ในคืนเหงา',
      melodyNotes: [{ step: 4, midiPitch: 67, durationSteps: 2 }],
    },
  ];

  // Space-separated words
  const shiftedSpaced = shiftLastTokenToNextBar(sampleBars, 0);
  assert.equal(shiftedSpaced[0].lyrics, 'ยังคิดถึงเธอ');
  assert.equal(shiftedSpaced[1].lyrics, 'เสมอ ในคืนเหงา');
  // Preserve non-lyric metadata
  assert.deepEqual(shiftedSpaced[0].chords, ['C', 'G']);
  assert.equal(shiftedSpaced[0].chordsPerBar, 2);
  assert.equal(shiftedSpaced[0].playStyle, 'let-ring');
  assert.deepEqual(shiftedSpaced[0].melodyNotes, [{ step: 0, midiPitch: 64, durationSteps: 4 }]);
  assert.equal(shiftedSpaced[0].vocalAudio, 'data:audio/webm;base64,AAA');
  assert.deepEqual(shiftedSpaced[1].chords, ['Am']);
  // Input array must stay untouched (immutable)
  assert.equal(sampleBars[0].lyrics, 'ยังคิดถึงเธอ เสมอ');

  // Contiguous Thai syllables without spaces
  const unspacedBars: SongBar[] = [
    {
      id: 'u1',
      chordsPerBar: 1,
      chords: ['G'],
      playStyle: 'normal',
      lyrics: 'หัวใจรักเธอ',
      melodyNotes: [],
    },
    {
      id: 'u2',
      chordsPerBar: 1,
      chords: ['D'],
      playStyle: 'normal',
      lyrics: '',
      melodyNotes: [],
    },
  ];
  const shiftedUnspaced = shiftLastTokenToNextBar(unspacedBars, 0);
  assert.equal(shiftedUnspaced[0].lyrics, 'หัวใจรัก');
  assert.equal(shiftedUnspaced[1].lyrics, 'เธอ');

  // Out-of-bounds / last bar must be no-op clone
  const untouched = shiftLastTokenToNextBar(sampleBars, 1);
  assert.equal(untouched[1].lyrics, 'ในคืนเหงา');
  assert.notEqual(untouched, sampleBars);
});

test('Phase 7A: SectionBuilder UI contract includes Real-Time HUD, Cross-Section link, Sheet Mode, and Shift button', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'SectionBuilder.tsx'),
    'utf8'
  );
  assert.match(src, /validateThaiLyricCouplets/);
  assert.match(src, /shiftLastTokenToNextBar/);
  assert.match(src, /sectionBudget\s*=\s*getSyllableBudgetForBpm/);
  assert.match(src, /sectionBudget\.barBudgets\?\.\[barIndex\]/);
  assert.match(src, /prevSectionLastBar/);
  assert.match(src, /สัมผัสต่อเนื่อง/);
  assert.match(src, /สัมผัสขาดวรรค/);
  assert.match(src, /แก้แบบแผ่นเดียว/);
  assert.match(src, /ปัดคำลง/);
});

test('nga-caravan and kob-bigass songwriter guides, few-shots, budgets, simulated lyrics & band arrangement', () => {
  assert.ok(VALID_SONGWRITER_STYLES.has('nga-caravan'));
  assert.ok(VALID_SONGWRITER_STYLES.has('kob-bigass'));

  const ngaProfile = SONGWRITER_STYLE_PROFILES.find((p) => p.id === 'nga-caravan');
  const kobProfile = SONGWRITER_STYLE_PROFILES.find((p) => p.id === 'kob-bigass');
  assert.ok(ngaProfile);
  assert.ok(kobProfile);
  assert.match(ngaProfile.label, /หงา คาราวาน/);
  assert.match(kobProfile.label, /กบ บิ๊กแอส/);
  assert.match(kobProfile.label, /Big Ass.*Bodyslam.*Labanoon/);

  const ngaBudget = getSyllableBudgetForBpm(84, '4/4', { songwriterStyle: 'nga-caravan' });
  assert.ok(ngaBudget.guidance.includes('หงา คาราวาน'));
  assert.ok(ngaBudget.min >= 4 && ngaBudget.max <= 10);

  const kobBudget = getSyllableBudgetForBpm(98, '4/4', { songwriterStyle: 'kob-bigass' });
  assert.ok(kobBudget.guidance.includes('กบ บิ๊กแอส'));
  assert.match(buildDynamicLyricFewShots({ songwriterStyle: 'nga-caravan' }), /หงา คาราวาน/);
  assert.match(buildDynamicLyricFewShots({ songwriterStyle: 'kob-bigass' }), /กบ บิ๊กแอส/);
  assert.match(buildLyricsSystemPrompt({ songwriterStyle: 'nga-caravan', sectionType: 'chorus' }), /หงา คาราวาน/);
  assert.match(buildLyricsSystemPrompt({ songwriterStyle: 'kob-bigass', sectionType: 'chorus' }), /กบ บิ๊กแอส/);

  for (const style of ['nga-caravan', 'kob-bigass'] as const) {
    const genre = style === 'nga-caravan' ? 'phuea-chiwit' : 'thai-rock';
    const bundle = buildStyledSimulatedSongLyrics({
      topic: 'แสงดาวและศรัทธา',
      mood: 'empowering',
      language: 'th',
      thaiGenre: genre,
      songwriterStyle: style,
    });
    assert.ok(bundle.verse.length >= 4);
    assert.ok(bundle.chorus.length >= 4);
    assert.ok(bundle.outro.length >= 2);

    const verseRhyme = validateThaiLyricCouplets(bundle.verse.slice(0, 4));
    assert.equal(verseRhyme.passed, true, `Expected verse rhyme to pass for ${style}`);
    assert.ok((verseRhyme.chainContinuityRatio ?? 0) >= 0.67);

    const chorusRhyme = validateThaiLyricCouplets(bundle.chorus.slice(0, 4));
    assert.equal(chorusRhyme.passed, true, `Expected chorus rhyme to pass for ${style}`);
    assert.ok((chorusRhyme.chainContinuityRatio ?? 0) >= 0.67);

    const simulated = buildSimulatedArchitectSong({
      stylePreset: style === 'nga-caravan' ? 'phuea-chiwit-road' : 'thai-rock-90s',
      vocalProfile: 'male',
      tempoFeel: 'medium',
      topic: 'บทเพลงแห่งชีวิต',
      language: 'th',
      thaiGenre: genre,
      songwriterStyle: style,
    });
    assert.equal(simulated.songwriterStyle, style);

    const arranged = applyGenreBandArrangement(simulated);
    if (style === 'nga-caravan') {
      assert.equal(arranged.mixer.guitarRhythm.style, 'fingerpicking');
      assert.equal(arranged.mixer.drums.style, 'shaker-cajon');
    } else {
      assert.equal(arranged.mixer.guitarRhythm.style, 'rock-power');
      assert.equal(arranged.mixer.drums.style, 'rock-drive');
    }
  }
});
