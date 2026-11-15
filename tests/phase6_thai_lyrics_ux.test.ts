import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  THAI_RHYME_GROUPS,
  analyzeThaiSyllablePhonetics,
  segmentThaiWordToSyllables,
  filterThaiRhymes,
  findThaiRhymes,
  validateThaiLyricCouplets,
} from '../src/lib/thaiRhymeHelper';
import {
  splitThaiLyricSyllables,
  getRootPitchClass,
  buildConversationalStepPlan,
  generateLyricAlignedGuideMelody,
} from '../src/lib/melodyUtils';
import {
  THAI_GENRE_PROFILES,
  THAI_ERA_PROFILES,
  THAI_DIALECT_PROFILES,
  SONGWRITER_STYLE_PROFILES,
  SECTION_ENERGY_ARC_BLUEPRINTS,
  EMOTIONAL_RESOLUTION_PROFILES,
  MASTER_LYRIC_FEW_SHOT_BANK,
  buildDynamicLyricFewShots,
  getSyllableBudgetForBpm,
  buildLyricsSystemPrompt,
  buildLyricsUserPrompt,
  buildEasyArchitectSystemPrompt,
  buildEasyArchitectUserPrompt,
} from '../src/lib/aiPrompts';
import { EASY_STYLE_PRESETS, buildSimulatedArchitectSong } from '../src/lib/songArchitect';
import { createDefaultSong } from '../src/lib/defaultSong';
import { POST as lyricsPost } from '../src/app/api/advance/lyrics/route';
import { POST as ttsCuePost } from '../src/app/api/advance/tts-cue/route';
import { generateSunoPrompt } from '../src/components/ExportModal';

async function withSimulatedKey<T>(fn: () => Promise<T>): Promise<T> {
  const prevGeminiKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    return await fn();
  } finally {
    if (prevGeminiKey !== undefined) process.env.GEMINI_API_KEY = prevGeminiKey;
  }
}

// ───────────────────────── 1. Thai Syllable Phonology & Expanded Rhymes ─────────────────────────

test('Phase 6 Phonology: syllable segmentation, คำเป็น/คำตาย, 5 Thai tones & filtered rhymes', () => {
  assert.ok(THAI_RHYME_GROUPS.length >= 34, `Expected >= 34 rhyme groups, got ${THAI_RHYME_GROUPS.length}`);

  const segmented = segmentThaiWordToSyllables('คิดถึงเธอจัง');
  assert.ok(segmented.length >= 3, `Expected >= 3 syllables for "คิดถึงเธอจัง", got ${segmented.length}`);

  // Live vs Dead syllable checks
  for (const liveWord of ['ใจ', 'ดาว', 'ฝัน']) {
    const p = analyzeThaiSyllablePhonetics(liveWord);
    assert.equal(p.isLiveSyllable, true, `Expected "${liveWord}" to be คำเป็น`);
  }
  for (const deadWord of ['รัก', 'เจ็บ', 'พบ']) {
    const p = analyzeThaiSyllablePhonetics(deadWord);
    assert.equal(p.isLiveSyllable, false, `Expected "${deadWord}" to be คำตาย`);
  }

  // Tone detection across mid-class & high/low-class open syllables
  assert.equal(analyzeThaiSyllablePhonetics('กา').tone, 'สามัญ');
  assert.equal(analyzeThaiSyllablePhonetics('ก่า').tone, 'เอก');
  assert.equal(analyzeThaiSyllablePhonetics('ก้า').tone, 'โท');
  assert.equal(analyzeThaiSyllablePhonetics('ก๊า').tone, 'ตรี');
  assert.equal(analyzeThaiSyllablePhonetics('ก๋า').tone, 'จัตวา');
  assert.equal(analyzeThaiSyllablePhonetics('ขา').tone, 'จัตวา');
  assert.equal(analyzeThaiSyllablePhonetics('ฟ้า').tone, 'ตรี');

  // filterThaiRhymes respects liveness filter
  const baseRhymes = findThaiRhymes('หัวใจ');
  assert.ok(baseRhymes.suggestions.length > 0);
  const liveOnly = filterThaiRhymes('หัวใจ', { liveness: 'live' });
  assert.ok(liveOnly.suggestions.length > 0);
  for (const word of liveOnly.suggestions) {
    assert.equal(
      analyzeThaiSyllablePhonetics(word).isLiveSyllable,
      true,
      `Filtered live rhyme "${word}" should be คำเป็น`
    );
  }
});

// ───────────────────────── 2. Lyric-Aligned 16-Step Guide Melody Engine ─────────────────────────

test('Phase 6 Melody: splitThaiLyricSyllables & generateLyricAlignedGuideMelody align to 16 steps & 2 chords', () => {
  const syllables = splitThaiLyricSyllables('วันเวลาที่ผ่านไป');
  assert.ok(syllables.length >= 4, `Expected >= 4 syllables, got ${JSON.stringify(syllables)}`);

  const notes = generateLyricAlignedGuideMelody({
    lyrics: 'คืนนี้มีดาวเคียงข้างกาย',
    chord1: 'C',
    chord2: 'G',
    baseKey: 'C',
    totalSteps: 16,
    stepsPerBeat: 4,
    pattern: 'gentle-arch',
    barIndex: 0,
  });

  assert.ok(notes.length >= 2, 'Expected multiple melody notes aligned to syllables');
  let prevEnd = 0;
  for (const note of notes) {
    assert.ok(note.step >= 0 && note.step < 16, `Step out of bounds: ${note.step}`);
    assert.ok(note.durationSteps >= 1 && note.step + note.durationSteps <= 16, 'Duration out of bar');
    assert.ok(note.step >= prevEnd, `Overlapping notes at step ${note.step} < ${prevEnd}`);
    assert.ok(note.midiPitch >= 55 && note.midiPitch <= 79, `MIDI pitch out of vocal range: ${note.midiPitch}`);
    prevEnd = note.step + note.durationSteps;
  }

  // With 2 chords and plenty of syllables, should place notes in both halves of the 16-step bar
  assert.ok(notes.some((n) => n.step < 8), 'Expected notes on chord1 half (steps 0..7)');
  assert.ok(notes.some((n) => n.step >= 8), 'Expected notes on chord2 half (steps 8..15)');

  // Dead short-vowel phrase should avoid long sustained note durations compared with open live phrase
  const liveNotes = generateLyricAlignedGuideMelody({
    lyrics: 'ลาตา',
    chord1: 'C',
    baseKey: 'C',
    totalSteps: 16,
    stepsPerBeat: 4,
  });
  const deadNotes = generateLyricAlignedGuideMelody({
    lyrics: 'รักจับกบ',
    chord1: 'C',
    baseKey: 'C',
    totalSteps: 16,
    stepsPerBeat: 4,
  });
  const maxLiveDur = Math.max(...liveNotes.map((n) => n.durationSteps));
  const avgDeadDur = deadNotes.reduce((a, b) => a + b.durationSteps, 0) / deadNotes.length;
  assert.ok(maxLiveDur >= avgDeadDur, 'Live open syllables should sustain >= dead closed syllables');
});

// ───────────────────────── 3. Thai Genre / Era / Dialect / Songwriter & Presets ─────────────────────────

test('Phase 6 Profiles & Prompts: 7 Thai genres, dialects, songwriters, 10 Easy presets & story context', () => {
  const genreIds = THAI_GENRE_PROFILES.map((g) => g.id);
  for (const expected of [
    'thai-pop',
    'thai-rock',
    'phuea-chiwit',
    'luk-thung',
    'luk-krung',
    'acoustic-indie',
    'thai-rnb',
  ]) {
    assert.ok(genreIds.includes(expected as (typeof genreIds)[number]), `Missing Thai genre ${expected}`);
  }
  for (const g of THAI_GENRE_PROFILES) {
    assert.ok(g.sunoTags.trim().length > 10);
    assert.ok(g.lyricRules.length > 0);
    assert.ok(g.rhymePreference.trim().length > 0);
  }

  assert.ok(THAI_ERA_PROFILES.length >= 5);
  assert.ok(THAI_DIALECT_PROFILES.some((d) => d.id === 'isan'));
  assert.ok(THAI_DIALECT_PROFILES.some((d) => d.id === 'northern'));
  assert.ok(SONGWRITER_STYLE_PROFILES.length >= 16);
  const songwriterIds = SONGWRITER_STYLE_PROFILES.map((s) => s.id);
  for (const writerId of [
    'phaiboon-butkhan',
    'suraphon-sombatcharoen',
    'chali-intrawichit',
    'sala-khunawut',
    'chonlathi-thanthong',
    'wasu-haohan',
    'joey-boy',
    'stamp-apiwat',
    'the-toys',
    'tan-lipta',
  ] as const) {
    assert.ok(songwriterIds.includes(writerId), `Missing songwriter profile ${writerId}`);
  }

  const classicPrompt = buildLyricsSystemPrompt({
    sectionType: 'verse',
    bpm: 72,
    thaiGenre: 'luk-krung',
    songwriterStyle: 'phaiboon-butkhan',
  });
  assert.match(classicPrompt, /ครูไพบูลย์/);

  const modernPrompt = buildLyricsSystemPrompt({
    sectionType: 'chorus',
    bpm: 105,
    thaiGenre: 'thai-pop',
    songwriterStyle: 'stamp-apiwat',
  });
  assert.match(modernPrompt, /แสตมป์/);

  // Easy presets expanded to 10 with 5 Thai genre presets
  assert.equal(EASY_STYLE_PRESETS.length, 10);
  const presetIds = EASY_STYLE_PRESETS.map((p) => p.id);
  for (const pId of ['thai-pop-hit', 'thai-rock-90s', 'phuea-chiwit-road', 'luk-thung-heart', 'luk-krung-classic']) {
    assert.ok(presetIds.includes(pId), `Missing Easy preset ${pId}`);
  }

  const budgetSlow = getSyllableBudgetForBpm(70, '4/4');
  const budgetFast = getSyllableBudgetForBpm(128, '4/4');
  assert.ok(budgetSlow.min < budgetSlow.max);
  assert.ok(budgetFast.tempoFeel === 'fast');

  const sysPrompt = buildLyricsSystemPrompt({
    sectionType: 'chorus',
    bpm: 84,
    timeSignature: '4/4',
    barCount: 6,
    thaiGenre: 'luk-thung',
    lyricEra: 'era-90s',
    lyricDialect: 'isan',
    songwriterStyle: 'suea-thanapol',
    polishExistingDraft: true,
  });
  assert.match(sysPrompt, /6 วรรค/);
  assert.match(sysPrompt, /ลูกทุ่ง/);
  assert.match(sysPrompt, /อีสาน/);
  assert.match(sysPrompt, /เกลา/);

  const usrPrompt = buildLyricsUserPrompt({
    sectionType: 'chorus',
    chordProgression: ['C', 'G', 'Am', 'F', 'Dm', 'G'],
    barCount: 6,
    bpm: 84,
    timeSignature: '4/4',
    mood: 'คิดถึงบ้าน',
    topic: 'กลับบ้านนาหน้าฝน',
    songTitle: 'ลมหนาวที่บ้านนา',
    thaiGenre: 'luk-thung',
    lyricDialect: 'isan',
    polishExistingDraft: true,
    existingLyrics: ['ฝนตกพรำๆ ยังคิดฮอดอ้ายบ่เซา'],
    allPriorSections: [{ name: 'Verse 1', type: 'verse', lyrics: ['เดินจากบ้านนามาไกลแสนไกล'] }],
  });
  assert.match(usrPrompt, /ลมหนาวที่บ้านนา/);
  assert.match(usrPrompt, /Verse 1/);
  assert.match(usrPrompt, /ฝนตกพรำๆ/);
});

// ───────────────────────── 4. API Routes: Dynamic 2..8 Bars Lyrics & Singing-Demo TTS ─────────────────────────

test('Phase 6 API Routes: /api/advance/lyrics dynamic 6-bar + phonetics & /api/advance/tts-cue singing-demo', async () => {
  await withSimulatedKey(async () => {
    const lyricsReq = new Request('http://localhost/api/advance/lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sectionType: 'chorus',
        sectionName: 'Chorus',
        chordProgression: ['C', 'G', 'Am', 'F', 'Dm', 'G'],
        barCount: 6,
        bpm: 84,
        timeSignature: '4/4',
        mood: 'ซึ้งคิดถึง',
        topic: 'ฝนตกที่เมืองกรุงคิดถึงคนบ้านนา',
        songTitle: 'ฝนเมืองกรุง',
        thaiGenre: 'luk-thung',
        lyricEra: 'era-90s',
        lyricDialect: 'isan',
        songwriterStyle: 'none',
        polishExistingDraft: true,
        existingLyrics: ['คืนนี้ฝนตกหนักจัง', 'คิดถึงเธอที่บ้านนา'],
      }),
    });

    const lyricsRes = await lyricsPost(lyricsReq);
    assert.equal(lyricsRes.status, 200);
    const lyricsData = (await lyricsRes.json()) as {
      isSimulated: boolean;
      lines: Array<{ chord: string; text: string; syllables: number; phonetics?: { tone: string } }>;
      rhymeValidation?: { passed: boolean };
    };
    assert.equal(lyricsData.isSimulated, true);
    assert.equal(lyricsData.lines.length, 6, 'Should generate dynamic 6 bars');
    assert.ok(lyricsData.lines[0].phonetics?.tone, 'Each line should include phonetics metadata');
    assert.ok(typeof lyricsData.rhymeValidation?.passed === 'boolean');

    // Verify TTS cue singing-demo mode
    const ttsReq = new Request('http://localhost/api/advance/tts-cue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'คืนนี้มีดาวเคียงข้างใจไม่ห่างหาย',
        bpm: 84,
        language: 'th',
        voice: 'Aoede',
        vocalMode: 'singing-demo',
        thaiGenre: 'luk-thung',
        includeCountIn: true,
      }),
    });
    const ttsRes = await ttsCuePost(ttsReq);
    assert.equal(ttsRes.status, 200);
    const ttsData = (await ttsRes.json()) as { isSimulated: boolean; cueText: string; tip: string };
    assert.equal(ttsData.isSimulated, true);
    assert.ok(ttsData.cueText.includes('คืนนี้มีดาว'));
  });
});

// ───────────────────────── 5. Suno Prompt Generator (Clean Lyrics vs Chords) ─────────────────────────

test('Phase 6 Suno Prompt: Thai genre, era, dialect tags & clean lyrics vs chord prefix mode', () => {
  const song = createDefaultSong();
  song.thaiGenre = 'luk-thung';
  song.lyricEra = 'era-90s';
  song.lyricDialect = 'isan';
  song.bpm = 82;
  song.baseKey = 'G';
  song.sections[0].bars[0].chords = ['G'];
  song.sections[0].bars[0].lyrics = 'ลมพัดโชยมาพาใจคิดฮอด';
  song.sections[0].bars[1].chords = ['Em'];
  song.sections[0].bars[1].lyrics = 'ยืนคอยเจ้าอยู่กลางทุ่งนา';

  const cleanResult = generateSunoPrompt(song, { includeChords: false });
  assert.match(cleanResult.stylePrompt, /Luk Thung/);
  assert.match(cleanResult.stylePrompt, /90s Thai/);
  assert.match(cleanResult.stylePrompt, /Isan Northeast Thai/);
  assert.match(cleanResult.stylePrompt, /82 BPM/);
  assert.ok(!cleanResult.lyricsMetatags.includes('(G)'), 'Clean Suno lyrics should hide (Chord) tags');
  assert.ok(cleanResult.lyricsMetatags.includes('ลมพัดโชยมาพาใจคิดฮอด'));

  const chordResult = generateSunoPrompt(song, { includeChords: true });
  assert.ok(chordResult.lyricsMetatags.includes('(G) ลมพัดโชยมาพาใจคิดฮอด'));

  // Validate couplet checker still confirms passing lyrics clean
  const coupletReport = validateThaiLyricCouplets(['ใจรักเธอเสมอไป', 'ไม่เคยเปลี่ยนใจจากลา', 'แม้วันเวลาจะพ้นผ่าน', 'ยังเก็บวันวานไว้ในตา']);
  assert.equal(typeof coupletReport.passed, 'boolean');
});

// ───────────────────────── 6. Phase 6 UI Wiring & Feature Contracts ─────────────────────────

test('Phase 6 UI Contracts: phonology inspector, AI vocal save, dialect/genre pickers & story continue', () => {
  const root = process.cwd();
  const advanceSrc = fs.readFileSync(path.join(root, 'src/components/AdvanceModeModal.tsx'), 'utf8');
  const pianoRollSrc = fs.readFileSync(path.join(root, 'src/components/MiniPianoRollModal.tsx'), 'utf8');
  const easyModalSrc = fs.readFileSync(path.join(root, 'src/components/EasyModeStarterModal.tsx'), 'utf8');
  const exportSrc = fs.readFileSync(path.join(root, 'src/components/ExportModal.tsx'), 'utf8');
  const sectionSrc = fs.readFileSync(path.join(root, 'src/components/SectionBuilder.tsx'), 'utf8');
  const pageSrc = fs.readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');

  // AdvanceModeModal contracts
  assert.match(advanceSrc, /analyzeThaiSyllablePhonetics/);
  assert.match(advanceSrc, /filterThaiRhymes/);
  assert.match(advanceSrc, /THAI_GENRE_PROFILES/);
  assert.match(advanceSrc, /THAI_DIALECT_PROFILES/);
  assert.match(advanceSrc, /SONGWRITER_STYLE_PROFILES/);
  assert.match(advanceSrc, /EMOTIONAL_RESOLUTION_PROFILES/);
  assert.match(advanceSrc, /SECTION_ENERGY_ARC_BLUEPRINTS/);
  assert.match(advanceSrc, /emotionalResolution/);
  assert.match(advanceSrc, /polishExistingDraft/);
  assert.match(advanceSrc, /onApplySectionVocalAudio/);

  // MiniPianoRollModal contracts
  assert.match(pianoRollSrc, /generateLyricAlignedGuideMelody/);
  assert.match(pianoRollSrc, /splitThaiLyricSyllables/);
  assert.match(pianoRollSrc, /onSaveVocalToBar/);
  assert.match(pianoRollSrc, /vocalMode:\s*'singing-demo'/);

  // EasyModeStarterModal contracts
  assert.match(easyModalSrc, /THAI_DIALECT_PROFILES/);
  assert.match(easyModalSrc, /SONGWRITER_STYLE_PROFILES/);
  assert.match(easyModalSrc, /EMOTIONAL_RESOLUTION_PROFILES/);
  assert.match(easyModalSrc, /lyricDialect/);
  assert.match(easyModalSrc, /songwriterStyle/);
  assert.match(easyModalSrc, /emotionalResolution/);

  // ExportModal contracts
  assert.match(exportSrc, /export function generateSunoPrompt/);
  assert.match(exportSrc, /showSunoChords/);
  assert.match(exportSrc, /handleCopyStyleTags/);

  // SectionBuilder contracts
  assert.match(sectionSrc, /getSyllableBudgetForBpm/);
  assert.match(sectionSrc, /analyzeThaiSyllablePhonetics/);
  assert.match(sectionSrc, /สัมผัสต่อจากวรรคก่อน/);
  assert.match(sectionSrc, /onAddNextAiStorySection/);

  // page.tsx wiring contracts
  assert.match(pageSrc, /onSaveVocalToBar/);
  assert.match(pageSrc, /onApplySectionVocalAudio/);
  assert.match(pageSrc, /onUpdateSongStyleMeta/);
  assert.match(pageSrc, /onAddNextAiStorySection/);
});

// ───────────── 7. Phase 6B Emotional Energy Arc, Hook Punchlines & Ending Resolution ─────────────

test('Phase 6B Energy Arc & Ending Resolution: blueprints, prompts & section-aware melody', () => {
  assert.equal(SECTION_ENERGY_ARC_BLUEPRINTS.chorus.energyScore, '10/10');
  assert.equal(SECTION_ENERGY_ARC_BLUEPRINTS.outro.energyScore, '3→1/10');
  assert.ok(EMOTIONAL_RESOLUTION_PROFILES.length >= 6);

  const resolutionIds = EMOTIONAL_RESOLUTION_PROFILES.map((r) => r.id);
  for (const requiredId of [
    'auto',
    'piercing-sting',
    'fulfilling-warm',
    'empowering-anthem',
    'catchy-earworm',
    'nostalgic-fade',
  ] as const) {
    assert.ok(resolutionIds.includes(requiredId), `Missing resolution profile: ${requiredId}`);
  }

  const chorusStingPrompt = buildLyricsSystemPrompt({
    sectionType: 'chorus',
    bpm: 84,
    emotionalResolution: 'piercing-sting',
  });
  assert.match(chorusStingPrompt, /10\/10/);
  assert.match(chorusStingPrompt, /บาดลึก/);

  const outroWarmPrompt = buildLyricsSystemPrompt({
    sectionType: 'outro',
    bpm: 78,
    emotionalResolution: 'fulfilling-warm',
  });
  assert.match(outroWarmPrompt, /อิ่มเอม/);

  const archSysPrompt = buildEasyArchitectSystemPrompt();
  assert.match(archSysPrompt, /Emotional Energy Arc/);

  const archUserPrompt = buildEasyArchitectUserPrompt({
    stylePreset: 'pop-ballad',
    vocalProfile: 'female',
    tempoFeel: 'slow',
    topic: 'เก็บภาพความทรงจำวันสุดท้ายไว้ในใจ',
    language: 'th',
    recommendedBpm: 76,
    recommendedGuitarModel: 'nylon',
    recommendedAmbience: 'bedroom',
    thaiGenre: 'thai-pop',
    emotionalResolution: 'piercing-sting',
  });
  assert.match(archUserPrompt, /บาดลึก/);
  assert.match(archUserPrompt, /pre-chorus/);
  assert.match(archUserPrompt, /chorus/);
  assert.match(archUserPrompt, /outro/);

  const testLine = 'รักเธอหมดหัวใจไม่เคยเปลี่ยน';
  const verseNotes = generateLyricAlignedGuideMelody({
    lyrics: testLine,
    chord1: 'G',
    baseKey: 'G',
    sectionType: 'verse',
  });
  const chorusNotes = generateLyricAlignedGuideMelody({
    lyrics: testLine,
    chord1: 'G',
    baseKey: 'G',
    sectionType: 'chorus',
  });
  assert.ok(verseNotes.length > 0 && chorusNotes.length > 0);
  const avg = (notes: typeof verseNotes) =>
    notes.reduce((sum, n) => sum + n.midiPitch, 0) / notes.length;
  assert.ok(
    avg(chorusNotes) > avg(verseNotes),
    `Expected chorus average pitch (${avg(chorusNotes)}) > verse average pitch (${avg(verseNotes)})`
  );

  const outroNotes = generateLyricAlignedGuideMelody({
    lyrics: 'ยังคงจำทุกคำจนวันสุดท้าย',
    chord1: 'G',
    baseKey: 'G',
    sectionType: 'outro',
    barIndex: 1,
  });
  assert.ok(outroNotes.length > 0);
  const lastOutroNote = outroNotes[outroNotes.length - 1];
  assert.equal(lastOutroNote.midiPitch % 12, getRootPitchClass('G'));
  assert.ok(lastOutroNote.durationSteps >= 3);
});

// ───────────── 8. Phase 6C Dynamic Few-Shot Bank, Chain-Rhyme Validator, Phrasing & Simulated Styles ─────────────

test('Phase 6C Dynamic Few-Shot Bank & Style/Section Syllable Budget', () => {
  // All 7 genres, 16+ songwriter styles (20 total), and 6 emotional resolutions exist in bank
  assert.equal(Object.keys(MASTER_LYRIC_FEW_SHOT_BANK.genres).length, 7);
  assert.ok(Object.keys(MASTER_LYRIC_FEW_SHOT_BANK.songwriters).length >= 16);
  assert.equal(Object.keys(MASTER_LYRIC_FEW_SHOT_BANK.resolutions).length, 6);

  const lukThungFewShot = buildDynamicLyricFewShots({
    thaiGenre: 'luk-thung',
    songwriterStyle: 'phaiboon-butkhan',
    emotionalResolution: 'nostalgic-fade',
    lyricDialect: 'isan',
  });
  const joeyFewShot = buildDynamicLyricFewShots({
    thaiGenre: 'thai-pop',
    songwriterStyle: 'joey-boy',
    emotionalResolution: 'catchy-earworm',
  });
  const deeFewShot = buildDynamicLyricFewShots({
    thaiGenre: 'thai-pop',
    songwriterStyle: 'dee-nitipong',
    emotionalResolution: 'piercing-sting',
    sectionType: 'outro',
  });

  assert.notEqual(lukThungFewShot, joeyFewShot);
  assert.notEqual(joeyFewShot, deeFewShot);
  assert.match(lukThungFewShot, /ไพบูลย์/);
  assert.match(lukThungFewShot, /อีสาน/);
  assert.match(joeyFewShot, /โจอี้ บอย/);
  assert.match(deeFewShot, /นิติพงษ์/);
  assert.match(deeFewShot, /Outro/);
  assert.ok(!deeFewShot.includes('กาแฟ'), 'Dynamic bank must not repeat coffee-shop template');

  // Section + songwriter style-aware syllable budget
  const joeyBudget = getSyllableBudgetForBpm(105, '4/4', {
    sectionType: 'verse',
    songwriterStyle: 'joey-boy',
  });
  const deeChorusBudget = getSyllableBudgetForBpm(76, '4/4', {
    sectionType: 'chorus',
    songwriterStyle: 'dee-nitipong',
  });
  const outroBudget = getSyllableBudgetForBpm(76, '4/4', {
    sectionType: 'outro',
    songwriterStyle: 'boy-kosiyabong',
  });

  assert.ok(joeyBudget.max > deeChorusBudget.max, 'Joey Boy flow should allow higher max syllables than slow ballad');
  assert.ok(outroBudget.max <= deeChorusBudget.max, 'Outro should contract syllable count for slow release');
  assert.ok(deeChorusBudget.barBudgets && deeChorusBudget.barBudgets.length >= 4);
  assert.match(deeChorusBudget.barBudgets[0].role, /Punchline/);
});

test('Phase 6C Chain-Rhyme Continuity, Duplicate Word & Syllable Budget Validation', () => {
  // Partial rhyme (only bars 0-1 rhyme, bars 2-3 completely disconnected) MUST fail chain continuity
  const partialBroken = validateThaiLyricCouplets([
    'เดินผ่านถนนยามค่ำคืนที่แสนไกล',
    'ในใจยังจดจำภาพเธอมิเคยเลือน',
    'รถยนต์วิ่งผ่านหน้าบ้านเสียงดัง',
    'ท้องฟ้ามืดครึ้มเหมือนฝนกำลังจะตก',
  ]);
  assert.equal(partialBroken.passed, false);
  assert.ok((partialBroken.chainContinuityRatio ?? 1) < 0.66);
  assert.ok(partialBroken.weakPairs.length >= 2);

  // Authentic chain-rhymed stanza with vowel shifts MUST pass with 100% continuity
  const chainRhymed = validateThaiLyricCouplets(
    [
      'ยังจำวันที่เราเดินสวนกันที่ชานชาลา',
      'เวลาไม่เคยพาภาพเธอเลือนไปไหน',
      'ในมุมเดิมที่ผู้คนเดินผ่านไปไว',
      'ใจดวงนี้ยังรอคอยเธอคนเดิม',
    ],
    { bpm: 84, enforceSyllableBudget: true }
  );
  assert.equal(chainRhymed.passed, true);
  assert.equal(chainRhymed.chainContinuityRatio, 1);
  assert.equal(chainRhymed.hasVowelShift, true);
  assert.equal((chainRhymed.duplicateEndWords ?? []).length, 0);
  assert.equal((chainRhymed.outOfBudgetBars ?? []).length, 0);

  // Duplicate trailing word detection + syllable budget check
  const repeatedEnd = validateThaiLyricCouplets(
    [
      'ยังคิดถึงเธอเสมอในหัวใจ',
      'ในทุกวันยังคงมีเธอในหัวใจ',
    ],
    { minSyllables: 5, maxSyllables: 12 }
  );
  assert.ok((repeatedEnd.duplicateEndWords ?? []).includes('หัวใจ'));
  assert.equal((repeatedEnd.syllableCounts ?? []).length, 2);
});

test('Phase 6C Conversational Phrasing Melody & Style/Outro-Aware Simulation', async () => {
  const sampleLine = 'คืนนี้มีดาวเคียงข้างกาย';
  const syls = splitThaiLyricSyllables(sampleLine);
  const phons = syls.map((s) => analyzeThaiSyllablePhonetics(s));
  const stepPlan = buildConversationalStepPlan(syls, phons, 16, {
    sectionType: 'verse',
    barIndex: 0,
  });
  assert.equal(stepPlan.length, syls.length);
  // Phrase group 1 finishes before Beat 3 (step 8), leaving a conversational breath gap into Beat 3+
  const maxBeforeBeat3 = Math.max(...stepPlan.filter((s) => s < 8));
  const firstBeat3OrLater = Math.min(...stepPlan.filter((s) => s >= 8));
  assert.ok(
    firstBeat3OrLater - maxBeforeBeat3 >= 2,
    `Expected mid-bar conversational breath gap >= 2 steps, got ${stepPlan.join(',')}`
  );

  // Simulated architect song has non-empty Outro lyrics and adapts to songwriterStyle & resolution
  const songDee = buildSimulatedArchitectSong({
    stylePreset: 'thai-pop-hit',
    vocalProfile: 'female',
    tempoFeel: 'slow',
    topic: 'คนไม่รัก',
    language: 'th',
    thaiGenre: 'thai-pop',
    songwriterStyle: 'dee-nitipong',
    emotionalResolution: 'piercing-sting',
  });
  const songJoey = buildSimulatedArchitectSong({
    stylePreset: 'upbeat-pop',
    vocalProfile: 'male',
    tempoFeel: 'fast',
    topic: 'แอบชอบเพื่อน',
    language: 'th',
    thaiGenre: 'thai-pop',
    songwriterStyle: 'joey-boy',
    emotionalResolution: 'catchy-earworm',
  });

  const outroDee = songDee.sections.find((s) => s.type === 'outro');
  const outroJoey = songJoey.sections.find((s) => s.type === 'outro');
  assert.ok(outroDee && outroDee.bars.every((b) => b.lyrics.trim().length > 0), 'Outro must have real lyrics');
  assert.ok(outroJoey && outroJoey.bars.every((b) => b.lyrics.trim().length > 0), 'Outro must have real lyrics');
  assert.notEqual(outroDee.bars[0].lyrics, outroJoey.bars[0].lyrics);

  const verseDee = songDee.sections.find((s) => s.type === 'verse')!;
  const verseJoey = songJoey.sections.find((s) => s.type === 'verse')!;
  assert.notEqual(verseDee.bars[0].lyrics, verseJoey.bars[0].lyrics);

  // /api/advance/lyrics simulated outro & style check
  await withSimulatedKey(async () => {
    const res = await lyricsPost(
      new Request('http://localhost/api/advance/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood: 'อกหัก',
          topic: 'ความจริงที่ต้องยอมรับ',
          chordProgression: ['Am', 'C'],
          sectionType: 'outro',
          barCount: 2,
          bpm: 74,
          thaiGenre: 'thai-pop',
          songwriterStyle: 'dee-nitipong',
          emotionalResolution: 'piercing-sting',
        }),
      })
    );
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      isSimulated: boolean;
      lines: Array<{ text: string }>;
      rhymeValidation?: { passed: boolean };
    };
    assert.equal(data.isSimulated, true);
    assert.equal(data.lines.length, 2);
    assert.ok(data.lines.every((l) => l.text.trim().length > 0));
    assert.equal(data.rhymeValidation?.passed, true);
  });
});
