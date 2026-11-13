/**
 * phase4_user_feedback.test.ts — Automated Verification for 3 User Requests:
 *   1. Per-Section Instrument Volume Sliders (0–100%)
 *   2. Lead Guitar Drive DSP Separation & Legacy 'fuzz' Fix
 *   3. Natural-Language AI Studio Director (Prompt-to-App Settings)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultSong } from '../src/lib/defaultSong';
import {
  flattenSong,
  planBar,
  getSectionTrackVolume,
  type PlannedEvent,
} from '../src/lib/barPlanner';
import {
  getLeadDriveDSPParams,
  makeGuitarDistortionCurve,
  makeGuitarFuzzCurve,
} from '../src/lib/audioEngine';
import {
  applyNaturalPromptToSong,
  applyDirectorPatchToSong,
  buildSongDirectorSummary,
} from '../src/lib/aiSongDirector';
import { POST as runAiDirector } from '../src/app/api/advance/director/route';

type NoteEv = Extract<PlannedEvent, { kind: 'note' }>;
type DrumEv = Extract<PlannedEvent, { kind: 'drum' }>;

// ───────────────────── 1. Per-Section Volume Sliders ─────────────────────

test('Per-Section Volume: getSectionTrackVolume defaults to 100 and clamps 0–100', () => {
  const song = createDefaultSong();
  const sec = song.sections[0];
  assert.equal(getSectionTrackVolume(sec, 'guitarRhythm'), 100);
  assert.equal(getSectionTrackVolume(sec, 'drums'), 100);

  sec.instruments.guitarRhythmVolume = 150;
  sec.instruments.bassVolume = -12;
  assert.equal(getSectionTrackVolume(sec, 'guitarRhythm'), 100);
  assert.equal(getSectionTrackVolume(sec, 'bass'), 0);
});

test('Per-Section Volume: scaling 50% lowers velocity and 0% mutes pitched & drum events', () => {
  const song = createDefaultSong();
  const targetIdx = song.sections.findIndex((s) => s.instruments.guitarRhythm && s.instruments.drums);
  assert.ok(targetIdx >= 0);

  const flatFull = flattenSong(song);
  const barIdx = flatFull.findIndex((f) => f.section.id === song.sections[targetIdx].id);
  assert.ok(barIdx >= 0);

  const fullPlan = planBar(song, flatFull, barIdx);
  const fullGtr = fullPlan.events.filter(
    (e): e is NoteEv => e.kind === 'note' && e.track === 'guitarRhythm'
  );
  const fullDrums = fullPlan.events.filter((e): e is DrumEv => e.kind === 'drum');
  assert.ok(fullGtr.length > 0 && fullDrums.length > 0);

  // Set section guitarRhythm to 50% and drums to 50%
  const halfSong = createDefaultSong();
  halfSong.sections[targetIdx].instruments.guitarRhythmVolume = 50;
  halfSong.sections[targetIdx].instruments.drumsVolume = 50;
  const halfPlan = planBar(halfSong, flattenSong(halfSong), barIdx);
  const halfGtr = halfPlan.events.filter(
    (e): e is NoteEv => e.kind === 'note' && e.track === 'guitarRhythm'
  );
  const halfDrums = halfPlan.events.filter((e): e is DrumEv => e.kind === 'drum');
  assert.equal(halfGtr.length, fullGtr.length);
  assert.equal(halfDrums.length, fullDrums.length);
  assert.ok(halfGtr[0].vel < fullGtr[0].vel, '50% volume must reduce guitar note velocity');
  assert.ok(halfDrums[0].vel < fullDrums[0].vel, '50% volume must reduce drum velocity');

  // Set section volumes to 0% -> track emits zero events
  const muteSong = createDefaultSong();
  muteSong.sections[targetIdx].instruments.guitarRhythmVolume = 0;
  muteSong.sections[targetIdx].instruments.drumsVolume = 0;
  const mutePlan = planBar(muteSong, flattenSong(muteSong), barIdx);
  const muteGtr = mutePlan.events.filter(
    (e): e is NoteEv => e.kind === 'note' && e.track === 'guitarRhythm'
  );
  const muteDrums = mutePlan.events.filter((e): e is DrumEv => e.kind === 'drum');
  assert.equal(muteGtr.length, 0);
  assert.equal(muteDrums.length, 0);
});

// ───────────────── 2. Lead Guitar Drive & Legacy 'fuzz' Fix ─────────────────

test('Lead Drive DSP: Clean vs Overdrive vs Distortion/Fuzz have clearly distinct parameters & curves', () => {
  const clean = getLeadDriveDSPParams('clean');
  const overdrive = getLeadDriveDSPParams('overdrive');
  const distortion = getLeadDriveDSPParams('distortion');
  const legacyFuzz = getLeadDriveDSPParams('fuzz');

  // Legacy 'fuzz' must resolve identically to 'distortion', NOT fall back to clean!
  assert.deepEqual(legacyFuzz, distortion);
  assert.equal(clean.dry, 1.0);
  assert.equal(clean.wet, 0.0);

  assert.equal(overdrive.curveType, 'tube');
  assert.equal(distortion.curveType, 'fuzz');
  assert.ok(distortion.pre > overdrive.pre * 1.8, 'Distortion/Fuzz must push substantially higher pre-gain');
  assert.ok(distortion.toneFreq > overdrive.toneFreq, 'Distortion/Fuzz must have brighter upper-mid bite than warm overdrive');
  assert.ok(distortion.toneGainDb > overdrive.toneGainDb);

  const tubeCurve = makeGuitarDistortionCurve(512);
  const fuzzCurve = makeGuitarFuzzCurve(512);
  const probeIdx = Math.floor(512 * 0.62); // mild positive amplitude ~+0.24
  assert.ok(
    Math.abs(fuzzCurve[probeIdx] - tubeCurve[probeIdx]) > 0.15,
    'Fuzz curve saturation slope must differ measurably from warm tube overdrive'
  );
});

// ───────────────────── 3. AI Studio Director Prompt Parser ─────────────────────

test('AI Song Director: applies Thai/English multi-clause prompt across global & per-section settings', () => {
  const base = createDefaultSong();
  const prompt =
    'ตั้งความเร็ว 95 bpm คีย์ G จังหวะ 3/4 ห้องคอนเสิร์ต ' +
    'ท่อน Intro เกาเบาๆ 60% ' +
    'ท่อน Verse ปิดกลอง เหลือเปียโน 50% ' +
    'ท่อน Chorus ลีดแตกหนัก 100% กลองเป็นชุด เบส 80% คอร์ด G D Em C';

  const { updatedSong, summaryActions } = applyNaturalPromptToSong(prompt, base);

  assert.ok(summaryActions.length >= 6);
  assert.equal(updatedSong.bpm, 95);
  assert.equal(updatedSong.baseKey, 'G');
  assert.equal(updatedSong.timeSignature, '3/4');
  assert.equal(updatedSong.ambience3D, 'unplugged-hall');

  const intro = updatedSong.sections.find((s) => s.type === 'intro');
  assert.ok(intro);
  assert.equal(intro.instruments.guitarRhythmStyle, 'fingerpicking');
  assert.equal(intro.instruments.guitarRhythmVolume, 60);

  const verse = updatedSong.sections.find((s) => s.type === 'verse');
  assert.ok(verse);
  assert.equal(verse.instruments.drums, false);
  assert.equal(verse.instruments.piano, true);
  assert.equal(verse.instruments.pianoVolume, 50);

  const chorus = updatedSong.sections.find((s) => s.type === 'chorus');
  assert.ok(chorus);
  assert.equal(chorus.instruments.guitarLead, true);
  assert.equal(chorus.instruments.guitarLeadDrive, 'distortion');
  assert.equal(chorus.instruments.guitarLeadVolume, 100);
  assert.equal(chorus.instruments.drums, true);
  assert.equal(chorus.instruments.drumsStyle, 'simple-kit');
  assert.equal(chorus.instruments.bassVolume, 80);
  assert.deepEqual(chorus.bars[0].chords, ['G']);
  if (chorus.bars[1]) assert.deepEqual(chorus.bars[1].chords, ['D']);
});

test('AI Song Director: empty or non-matching prompt leaves original song untouched', () => {
  const base = createDefaultSong();
  const res = applyNaturalPromptToSong('สวัสดีครับ', base);
  assert.equal(res.summaryActions.length, 0);
  assert.equal(res.updatedSong.bpm, base.bpm);
  assert.equal(res.updatedSong.baseKey, base.baseKey);
});

test('AI Song Director Patch & /api/advance/director: uses Gemini 4 Hydrogen with key, clamps values, and degrades gracefully offline', async () => {
  const base = createDefaultSong();
  const prevKey = process.env.GEMINI_API_KEY;
  const prevModel = process.env.GEMINI_MODEL;
  const origFetch = globalThis.fetch;

  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;

  try {
    // 1. Missing key -> simulated offline director response
    const simRes = await runAiDirector(
      new Request('http://localhost/api/advance/director', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'ขอเพลงชิลๆ', songSummary: buildSongDirectorSummary(base) }),
      })
    );
    assert.equal(simRes.status, 200);
    const simData = (await simRes.json()) as { isSimulated: boolean; model: string; patch: unknown };
    assert.equal(simData.isSimulated, true);
    assert.equal(simData.patch, null);

    // 2. With GEMINI_API_KEY -> calls gemini-4-hydrogen with x-goog-api-key header & applies patch safely
    process.env.GEMINI_API_KEY = 'secret-director-key-test';
    const captured: { url: string; headerKey: string | null } = { url: '', headerKey: null };

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      captured.url = typeof input === 'string' ? input : input.toString();
      captured.headerKey = new Headers(init?.headers).get('x-goog-api-key');
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      bpm: 999, // over-range -> clamped to 220
                      baseKey: 'A',
                      ambience3D: 'unplugged-hall',
                      sectionPatches: [
                        {
                          sectionType: 'chorus',
                          guitarLeadDrive: 'fuzz', // normalized to distortion
                          guitarLeadVolume: 140, // clamped to 100
                          drumsStyle: 'simple-kit',
                          drumsVolume: 85,
                        },
                      ],
                      summaryNotes: ['ตั้งค่าสไตล์ Concert Rock ด้วย Gemini 4 Hydrogen'],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const liveRes = await runAiDirector(
      new Request('http://localhost/api/advance/director', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'จัดให้เป็นคอนเสิร์ตร็อคคีย์ A ท่อนฮุคกลองชุด ลีดแตกหนัก',
          songSummary: buildSongDirectorSummary(base),
        }),
      })
    );
    assert.equal(liveRes.status, 200);
    assert.ok(captured.url.includes('gemini-4-hydrogen'));
    assert.ok(!captured.url.includes('secret-director-key-test'));
    assert.equal(captured.headerKey, 'secret-director-key-test');

    const liveText = await liveRes.text();
    assert.ok(!liveText.includes('secret-director-key-test'));
    const liveData = JSON.parse(liveText) as {
      isSimulated: boolean;
      model: string;
      patch: Parameters<typeof applyDirectorPatchToSong>[0];
    };
    assert.equal(liveData.isSimulated, false);
    assert.equal(liveData.model, 'gemini-4-hydrogen');

    const applied = applyDirectorPatchToSong(liveData.patch, base);
    assert.equal(applied.updatedSong.bpm, 220);
    assert.equal(applied.updatedSong.baseKey, 'A');
    assert.equal(applied.updatedSong.ambience3D, 'unplugged-hall');
    const chorus = applied.updatedSong.sections.find((s) => s.type === 'chorus');
    assert.ok(chorus);
    assert.equal(chorus.instruments.guitarLeadDrive, 'distortion');
    assert.equal(chorus.instruments.guitarLeadVolume, 100);
    assert.equal(chorus.instruments.drumsStyle, 'simple-kit');
    assert.equal(chorus.instruments.drumsVolume, 85);
  } finally {
    globalThis.fetch = origFetch;
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    else delete process.env.GEMINI_API_KEY;
    if (prevModel !== undefined) process.env.GEMINI_MODEL = prevModel;
    else delete process.env.GEMINI_MODEL;
  }
});
